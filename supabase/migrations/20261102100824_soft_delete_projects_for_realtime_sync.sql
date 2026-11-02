ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_active_user_updated_at
  ON public.projects (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
