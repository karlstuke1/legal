CREATE POLICY "Workspace members can update files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'workspace-files' AND is_workspace_member(auth.uid(), (storage.foldername(name))[1]::uuid))
WITH CHECK (bucket_id = 'workspace-files' AND is_workspace_member(auth.uid(), (storage.foldername(name))[1]::uuid));