
CREATE TABLE IF NOT EXISTS public.studio_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled Project',
  prompt text NOT NULL DEFAULT '',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_build_job_id uuid REFERENCES public.build_jobs(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_sessions_project_id_idx
ON public.studio_sessions(project_id);

ALTER TABLE public.studio_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_sessions'
      AND policyname = 'Users can read own studio session'
  ) THEN
    CREATE POLICY "Users can read own studio session"
    ON public.studio_sessions
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_sessions'
      AND policyname = 'Users can insert own studio session'
  ) THEN
    CREATE POLICY "Users can insert own studio session"
    ON public.studio_sessions
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_sessions'
      AND policyname = 'Users can update own studio session'
  ) THEN
    CREATE POLICY "Users can update own studio session"
    ON public.studio_sessions
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE
ON public.studio_sessions TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'studio_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime
    ADD TABLE public.studio_sessions;
  END IF;
END $$;
