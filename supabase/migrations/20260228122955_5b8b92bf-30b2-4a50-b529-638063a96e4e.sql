
-- Add status column to matters
ALTER TABLE public.matters ADD COLUMN status text NOT NULL DEFAULT 'active';

-- Create matter_tags table
CREATE TABLE public.matter_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  matter_id uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text NOT NULL DEFAULT 'gray',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create matter_notes table
CREATE TABLE public.matter_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  matter_id uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS for matter_tags
ALTER TABLE public.matter_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tags" ON public.matter_tags
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can create tags" ON public.matter_tags
  FOR INSERT WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can delete tags" ON public.matter_tags
  FOR DELETE USING (is_workspace_member(auth.uid(), workspace_id));

-- RLS for matter_notes
ALTER TABLE public.matter_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view notes" ON public.matter_notes
  FOR SELECT USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can create notes" ON public.matter_notes
  FOR INSERT WITH CHECK (is_workspace_member(auth.uid(), workspace_id) AND auth.uid() = created_by);

CREATE POLICY "Members can update own notes" ON public.matter_notes
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Members can delete own notes" ON public.matter_notes
  FOR DELETE USING (auth.uid() = created_by);
