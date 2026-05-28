
-- Create a security definer function to get current user's email safely
CREATE OR REPLACE FUNCTION public.get_auth_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text FROM auth.users WHERE id = auth.uid()
$$;

-- Drop and recreate the problematic policies
DROP POLICY IF EXISTS "Admins can view invitations" ON public.workspace_invitations;
CREATE POLICY "Admins can view invitations"
  ON public.workspace_invitations FOR SELECT
  USING (
    is_workspace_member(auth.uid(), workspace_id)
    OR email = public.get_auth_email()
  );

DROP POLICY IF EXISTS "Admins can update invitations" ON public.workspace_invitations;
CREATE POLICY "Admins can update invitations"
  ON public.workspace_invitations FOR UPDATE
  USING (
    (get_workspace_role(auth.uid(), workspace_id) = ANY (ARRAY['owner'::workspace_role, 'admin'::workspace_role]))
    OR email = public.get_auth_email()
  );
