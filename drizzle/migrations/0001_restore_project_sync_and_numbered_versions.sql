ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS files JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version_counter BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.project_versions
  ADD COLUMN IF NOT EXISTS version_number BIGINT;

WITH ranked_versions AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at ASC, id ASC) AS version_number
  FROM public.project_versions
)
UPDATE public.project_versions AS versions
SET version_number = ranked_versions.version_number
FROM ranked_versions
WHERE versions.id = ranked_versions.id
  AND versions.version_number IS NULL;

ALTER TABLE public.project_versions
  ALTER COLUMN version_number SET DEFAULT 1,
  ALTER COLUMN version_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_versions_project_number_idx
  ON public.project_versions (project_id, version_number);

CREATE INDEX IF NOT EXISTS idx_projects_active_user_updated_at
  ON public.projects (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions TO authenticated;
GRANT ALL ON public.project_versions TO service_role;

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

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

CREATE OR REPLACE FUNCTION public.prepare_project_code_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version_counter := 1;
  ELSIF OLD.code IS DISTINCT FROM NEW.code THEN
    NEW.version_counter := CASE WHEN OLD.version_counter = 0 THEN 2 ELSE OLD.version_counter + 1 END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_project_code_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.project_versions (project_id, user_id, code, prompt, version_number)
    VALUES (NEW.id, NEW.user_id, NEW.code, NEW.prompt, 1);
  ELSIF OLD.code IS DISTINCT FROM NEW.code THEN
    IF OLD.version_counter = 0 THEN
      INSERT INTO public.project_versions (project_id, user_id, code, prompt, version_number)
      VALUES (OLD.id, OLD.user_id, OLD.code, OLD.prompt, 1);
    END IF;
    INSERT INTO public.project_versions (project_id, user_id, code, prompt, version_number)
    VALUES (NEW.id, NEW.user_id, NEW.code, NEW.prompt, NEW.version_counter);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_project_code_version ON public.projects;
CREATE TRIGGER prepare_project_code_version
BEFORE INSERT OR UPDATE OF code ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.prepare_project_code_version();

DROP TRIGGER IF EXISTS capture_project_code_version ON public.projects;
CREATE TRIGGER capture_project_code_version
AFTER INSERT OR UPDATE OF code ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.capture_project_code_version();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'projects') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'project_versions') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.project_versions;
    END IF;
  END IF;
END;
$$;