
-- 1. Create workspace_invitations table
CREATE TABLE public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  invited_by uuid NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Admins/owners can manage invitations
CREATE POLICY "Admins can insert invitations"
  ON public.workspace_invitations FOR INSERT
  WITH CHECK (
    get_workspace_role(auth.uid(), workspace_id) IN ('owner'::workspace_role, 'admin'::workspace_role)
    AND auth.uid() = invited_by
  );

CREATE POLICY "Admins can view invitations"
  ON public.workspace_invitations FOR SELECT
  USING (
    is_workspace_member(auth.uid(), workspace_id)
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Admins can delete invitations"
  ON public.workspace_invitations FOR DELETE
  USING (
    get_workspace_role(auth.uid(), workspace_id) IN ('owner'::workspace_role, 'admin'::workspace_role)
  );

CREATE POLICY "Admins can update invitations"
  ON public.workspace_invitations FOR UPDATE
  USING (
    get_workspace_role(auth.uid(), workspace_id) IN ('owner'::workspace_role, 'admin'::workspace_role)
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- 2. Extend plans table with Stripe and seats fields
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS seats_limit integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
