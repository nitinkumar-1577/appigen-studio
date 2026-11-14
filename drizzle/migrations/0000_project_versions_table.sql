CREATE TABLE public.project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.project_versions TO authenticated;
GRANT ALL ON public.project_versions TO service_role;
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own project versions"
  ON public.project_versions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can create versions for their own projects"
  ON public.project_versions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_versions.project_id
        AND projects.user_id = auth.uid()
    )
  );
CREATE INDEX project_versions_project_created_idx
  ON public.project_versions(project_id, created_at DESC);
CREATE INDEX project_versions_user_id_idx
  ON public.project_versions(user_id);