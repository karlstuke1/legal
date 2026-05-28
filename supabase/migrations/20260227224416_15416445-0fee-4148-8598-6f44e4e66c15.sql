
-- Enums
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.chat_mode AS ENUM ('research', 'document_review', 'draft', 'playbook', 'vault');

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  user_role TEXT DEFAULT 'other',
  default_jurisdiction JSONB DEFAULT '["DE"]'::jsonb,
  default_sources JSONB DEFAULT '["AUTO"]'::jsonb,
  default_mode public.chat_mode DEFAULT 'research',
  privacy_no_store BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User roles (app-level, separate from workspace roles)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Workspaces
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Workspace members
CREATE TABLE public.workspace_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Security definer function to check workspace membership
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = _user_id AND workspace_id = _workspace_id)
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_role(_user_id UUID, _workspace_id UUID)
RETURNS public.workspace_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.workspace_members WHERE user_id = _user_id AND workspace_id = _workspace_id
$$;

-- Workspace RLS
CREATE POLICY "Members can view workspaces" ON public.workspaces FOR SELECT USING (public.is_workspace_member(auth.uid(), id));
CREATE POLICY "Authenticated users can create workspaces" ON public.workspaces FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners can update workspaces" ON public.workspaces FOR UPDATE USING (public.get_workspace_role(auth.uid(), id) = 'owner');
CREATE POLICY "Owners can delete workspaces" ON public.workspaces FOR DELETE USING (public.get_workspace_role(auth.uid(), id) = 'owner');

-- Workspace members RLS
CREATE POLICY "Members can view workspace members" ON public.workspace_members FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Admins/owners can add members" ON public.workspace_members FOR INSERT WITH CHECK (
  public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'admin')
  OR (auth.uid() = user_id AND role = 'owner')
);
CREATE POLICY "Admins/owners can update members" ON public.workspace_members FOR UPDATE USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'admin'));
CREATE POLICY "Admins/owners can remove members" ON public.workspace_members FOR DELETE USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'admin'));

-- Auto-create workspace + owner membership on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS TRIGGER AS $$
DECLARE
  ws_id UUID;
BEGIN
  INSERT INTO public.workspaces (id, name, created_by) VALUES (gen_random_uuid(), 'Mein Workspace', NEW.id) RETURNING id INTO ws_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (ws_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_auth_user_created_workspace AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_workspace();

-- Matters
CREATE TABLE public.matters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.matters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view matters" ON public.matters FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can create matters" ON public.matters FOR INSERT WITH CHECK (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'admin', 'member'));
CREATE POLICY "Admins can update matters" ON public.matters FOR UPDATE USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'admin'));
CREATE POLICY "Admins can delete matters" ON public.matters FOR DELETE USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'admin'));

-- Chats
CREATE TABLE public.chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  matter_id UUID REFERENCES public.matters(id) ON DELETE SET NULL,
  title TEXT DEFAULT 'Neuer Chat',
  mode public.chat_mode NOT NULL DEFAULT 'research',
  jurisdiction JSONB NOT NULL DEFAULT '["DE"]'::jsonb,
  sources JSONB NOT NULL DEFAULT '["AUTO"]'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view chats" ON public.chats FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can create chats" ON public.chats FOR INSERT WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) AND auth.uid() = created_by);
CREATE POLICY "Members can update chats" ON public.chats FOR UPDATE USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can delete chats" ON public.chats FOR DELETE USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'admin'));
CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_chat_member(_user_id UUID, _chat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chats c
    JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = _chat_id AND wm.user_id = _user_id
  )
$$;

CREATE POLICY "Members can view messages" ON public.messages FOR SELECT USING (public.is_chat_member(auth.uid(), chat_id));
CREATE POLICY "Members can create messages" ON public.messages FOR INSERT WITH CHECK (public.is_chat_member(auth.uid(), chat_id));

-- Files
CREATE TABLE public.files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  matter_id UUID REFERENCES public.matters(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view files" ON public.files FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can upload files" ON public.files FOR INSERT WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) AND auth.uid() = uploaded_by);
CREATE POLICY "Admins can delete files" ON public.files FOR DELETE USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'admin'));

-- Citations
CREATE TABLE public.citations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  doc_ref TEXT,
  title TEXT,
  doc_date TEXT,
  pinpoint TEXT,
  url TEXT,
  snippet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.citations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view citations" ON public.citations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_chat_member(auth.uid(), m.chat_id))
);
CREATE POLICY "System can insert citations" ON public.citations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_chat_member(auth.uid(), m.chat_id))
);

-- Retrieval logs
CREATE TABLE public.retrieval_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  latency_ms INTEGER,
  top_results JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.retrieval_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view retrieval logs" ON public.retrieval_logs FOR SELECT USING (
  message_id IS NULL OR EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_chat_member(auth.uid(), m.chat_id))
);
CREATE POLICY "System can insert retrieval logs" ON public.retrieval_logs FOR INSERT WITH CHECK (true);

-- Usage ledger
CREATE TABLE public.usage_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL,
  cost_estimate NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view usage" ON public.usage_ledger FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "System can insert usage" ON public.usage_ledger FOR INSERT WITH CHECK (true);

-- Plans
CREATE TABLE public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  monthly_budget_cents INTEGER NOT NULL DEFAULT 0,
  hard_limit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view plans" ON public.plans FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners can update plans" ON public.plans FOR UPDATE USING (public.get_workspace_role(auth.uid(), workspace_id) = 'owner');

-- Storage bucket for workspace files
INSERT INTO storage.buckets (id, name, public) VALUES ('workspace-files', 'workspace-files', false);

CREATE POLICY "Workspace members can view files" ON storage.objects FOR SELECT USING (
  bucket_id = 'workspace-files' AND public.is_workspace_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);
CREATE POLICY "Workspace members can upload files" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'workspace-files' AND public.is_workspace_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);
CREATE POLICY "Workspace admins can delete files" ON storage.objects FOR DELETE USING (
  bucket_id = 'workspace-files' AND public.get_workspace_role(auth.uid(), (storage.foldername(name))[1]::uuid) IN ('owner', 'admin')
);

-- Indexes
CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON public.workspace_members(workspace_id);
CREATE INDEX idx_chats_workspace ON public.chats(workspace_id);
CREATE INDEX idx_chats_updated ON public.chats(updated_at DESC);
CREATE INDEX idx_messages_chat ON public.messages(chat_id);
CREATE INDEX idx_messages_created ON public.messages(created_at);
CREATE INDEX idx_files_workspace ON public.files(workspace_id);
CREATE INDEX idx_usage_workspace ON public.usage_ledger(workspace_id);
CREATE INDEX idx_citations_message ON public.citations(message_id);
