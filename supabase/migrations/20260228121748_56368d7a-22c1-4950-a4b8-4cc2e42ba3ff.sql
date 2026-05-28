CREATE POLICY "Members can update files"
ON public.files
FOR UPDATE
TO authenticated
USING (is_workspace_member(auth.uid(), workspace_id))
WITH CHECK (is_workspace_member(auth.uid(), workspace_id));