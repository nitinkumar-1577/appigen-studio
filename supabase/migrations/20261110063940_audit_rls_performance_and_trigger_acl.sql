-- Keep each ownership check unchanged while evaluating auth.uid() once per statement.
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
CREATE POLICY "Users can create their own projects"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own project versions" ON public.project_versions;
CREATE POLICY "Users can view their own project versions"
  ON public.project_versions FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_versions.project_id
        AND projects.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create versions for their own projects" ON public.project_versions;
CREATE POLICY "Users can create versions for their own projects"
  ON public.project_versions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_versions.project_id
        AND projects.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update their own project versions" ON public.project_versions;
CREATE POLICY "Users can update their own project versions"
  ON public.project_versions FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_versions.project_id
        AND projects.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_versions.project_id
        AND projects.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete their own project versions" ON public.project_versions;
CREATE POLICY "Users can delete their own project versions"
  ON public.project_versions FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_versions.project_id
        AND projects.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can read their own activity" ON public.user_activity;
CREATE POLICY "Users can read their own activity"
  ON public.user_activity FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can record their own activity" ON public.user_activity;
CREATE POLICY "Users can record their own activity"
  ON public.user_activity FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Trigger execution is checked when CREATE TRIGGER runs, not when it fires.
-- Keep trusted backend access while removing the public RPC surface.
REVOKE EXECUTE ON FUNCTION public.capture_project_code_version() FROM PUBLIC, anon, authenticated;
