
-- Add usage limit columns to plans table
ALTER TABLE public.plans
  ADD COLUMN monthly_queries_limit integer NOT NULL DEFAULT 25,
  ADD COLUMN monthly_uploads_limit integer NOT NULL DEFAULT 5,
  ADD COLUMN monthly_pseudonymizations_limit integer NOT NULL DEFAULT 5;

-- Set limits per plan type for existing rows
UPDATE public.plans SET
  monthly_queries_limit = CASE plan
    WHEN 'free' THEN 10
    WHEN 'starter' THEN 100
    WHEN 'professional' THEN 500
    WHEN 'enterprise' THEN 999999
    ELSE 25
  END,
  monthly_uploads_limit = CASE plan
    WHEN 'free' THEN 5
    WHEN 'starter' THEN 50
    WHEN 'professional' THEN 200
    WHEN 'enterprise' THEN 999999
    ELSE 5
  END,
  monthly_pseudonymizations_limit = CASE plan
    WHEN 'free' THEN 3
    WHEN 'starter' THEN 25
    WHEN 'professional' THEN 100
    WHEN 'enterprise' THEN 999999
    ELSE 5
  END;

-- Create pseudonymization_logs table to track usage
CREATE TABLE public.pseudonymization_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  original_text text,
  pseudonymized_text text,
  entities_found jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pseudonymization_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pseudonymization logs"
  ON public.pseudonymization_logs FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Members can insert pseudonymization logs"
  ON public.pseudonymization_logs FOR INSERT
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));
