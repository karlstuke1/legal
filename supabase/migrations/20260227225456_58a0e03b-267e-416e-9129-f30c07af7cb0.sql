
-- Add storage policies for workspace files (using CREATE IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workspace members can upload files' AND tablename = 'objects') THEN
    CREATE POLICY "Workspace members can upload files"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'workspace-files'
        AND public.is_workspace_member(auth.uid(), (storage.foldername(name))[1]::uuid)
      );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workspace members can read files' AND tablename = 'objects') THEN
    CREATE POLICY "Workspace members can read files"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'workspace-files'
        AND public.is_workspace_member(auth.uid(), (storage.foldername(name))[1]::uuid)
      );
  END IF;
END $$;
