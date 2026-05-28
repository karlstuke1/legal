
-- 1. retrieval_logs: remove the message_id IS NULL bypass
DROP POLICY IF EXISTS "Members can view retrieval logs" ON public.retrieval_logs;
CREATE POLICY "Members can view retrieval logs"
ON public.retrieval_logs
FOR SELECT
USING (
  message_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = retrieval_logs.message_id
      AND public.is_chat_member(auth.uid(), m.chat_id)
  )
);

-- 2. workspace_members: remove privilege-escalation self-owner branch.
-- Initial owner membership is created by SECURITY DEFINER trigger handle_new_user_workspace.
DROP POLICY IF EXISTS "Admins/owners can add members" ON public.workspace_members;
CREATE POLICY "Admins/owners can add members"
ON public.workspace_members
FOR INSERT
WITH CHECK (
  public.get_workspace_role(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);

-- 3. audit_logs: require workspace membership when workspace_id is set
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = user_id
  AND (
    workspace_id IS NULL
    OR public.is_workspace_member(auth.uid(), workspace_id)
  )
);

-- 4. plans: restrict to owners/admins (contains Stripe customer/subscription IDs)
DROP POLICY IF EXISTS "Members can view plans" ON public.plans;
CREATE POLICY "Owners and admins can view plans"
ON public.plans
FOR SELECT
USING (
  public.get_workspace_role(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);

-- 5. pseudonymization_logs: restrict reads to owners/admins (contains original sensitive text)
DROP POLICY IF EXISTS "Members can view pseudonymization logs" ON public.pseudonymization_logs;
CREATE POLICY "Owners and admins can view pseudonymization logs"
ON public.pseudonymization_logs
FOR SELECT
USING (
  public.get_workspace_role(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);

-- 6. usage_ledger: enforce workspace membership on insert
DROP POLICY IF EXISTS "Authenticated can insert usage" ON public.usage_ledger;
CREATE POLICY "Members can insert usage"
ON public.usage_ledger
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.is_workspace_member(auth.uid(), workspace_id)
);
