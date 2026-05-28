-- Remove member-level SELECT on usage_ledger (replace with admin-only)
DROP POLICY IF EXISTS "Members can view usage" ON public.usage_ledger;

CREATE POLICY "Admins can view usage"
  ON public.usage_ledger
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Remove "users can view own feedback" on message_feedback (admin policy already exists)
DROP POLICY IF EXISTS "Users can view own feedback" ON public.message_feedback;
