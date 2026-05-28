
-- Chat sharing: shared_chats table for read-only links
CREATE TABLE public.shared_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(token)
);

ALTER TABLE public.shared_chats ENABLE ROW LEVEL SECURITY;

-- Members can create share links for chats in their workspace
CREATE POLICY "Members can create share links"
  ON public.shared_chats FOR INSERT
  WITH CHECK (is_chat_member(auth.uid(), chat_id) AND auth.uid() = created_by);

-- Members can view share links for their chats
CREATE POLICY "Members can view share links"
  ON public.shared_chats FOR SELECT
  USING (is_chat_member(auth.uid(), chat_id));

-- Members can deactivate share links
CREATE POLICY "Members can update share links"
  ON public.shared_chats FOR UPDATE
  USING (is_chat_member(auth.uid(), chat_id));

-- Members can delete share links
CREATE POLICY "Members can delete share links"
  ON public.shared_chats FOR DELETE
  USING (is_chat_member(auth.uid(), chat_id));

-- Answer pinning: pinned_messages table
CREATE TABLE public.pinned_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can pin messages"
  ON public.pinned_messages FOR INSERT
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id) AND auth.uid() = user_id);

CREATE POLICY "Members can view pinned messages"
  ON public.pinned_messages FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can unpin own pins"
  ON public.pinned_messages FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own pins"
  ON public.pinned_messages FOR UPDATE
  USING (auth.uid() = user_id);
