
-- Create analysis type enum
CREATE TYPE public.analysis_type AS ENUM ('flow', 'extraction');
CREATE TYPE public.analysis_status AS ENUM ('pending', 'processing', 'done', 'error');

-- matter_analyses table
CREATE TABLE public.matter_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type analysis_type NOT NULL,
  status analysis_status NOT NULL DEFAULT 'pending',
  summary text,
  questions jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- matter_analysis_results table
CREATE TABLE public.matter_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.matter_analyses(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  file_name_suggestion text,
  doc_date date,
  doc_summary text,
  extracted_data jsonb,
  included boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.matter_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matter_analysis_results ENABLE ROW LEVEL SECURITY;

-- RLS for matter_analyses
CREATE POLICY "Members can view analyses"
  ON public.matter_analyses FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can create analyses"
  ON public.matter_analyses FOR INSERT
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can update analyses"
  ON public.matter_analyses FOR UPDATE
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Admins can delete analyses"
  ON public.matter_analyses FOR DELETE
  USING (get_workspace_role(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

-- RLS for matter_analysis_results (join through analysis -> workspace)
CREATE POLICY "Members can view analysis results"
  ON public.matter_analysis_results FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.matter_analyses ma
    WHERE ma.id = analysis_id AND is_workspace_member(auth.uid(), ma.workspace_id)
  ));

CREATE POLICY "Members can insert analysis results"
  ON public.matter_analysis_results FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.matter_analyses ma
    WHERE ma.id = analysis_id AND is_workspace_member(auth.uid(), ma.workspace_id)
  ));

CREATE POLICY "Members can update analysis results"
  ON public.matter_analysis_results FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.matter_analyses ma
    WHERE ma.id = analysis_id AND is_workspace_member(auth.uid(), ma.workspace_id)
  ));

-- Updated_at trigger
CREATE TRIGGER update_matter_analyses_updated_at
  BEFORE UPDATE ON public.matter_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
