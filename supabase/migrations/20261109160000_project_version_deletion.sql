DROP POLICY IF EXISTS "Users can delete their own project versions"
  ON public.project_versions;

CREATE POLICY "Users can delete their own project versions"
  ON public.project_versions
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_versions.project_id
        AND projects.user_id = auth.uid()
    )
  );

GRANT DELETE ON public.project_versions TO authenticated;
