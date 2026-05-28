-- Add RLS policy for workspace members to view their workspace usage
CREATE POLICY "Members can view workspace usage"
  ON public.usage_ledger
  FOR SELECT
  USING (is_workspace_member(auth.uid(), workspace_id));