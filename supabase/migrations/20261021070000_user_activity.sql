CREATE TABLE public.user_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('build', 'edit', 'github', 'prompt')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  prompt_characters INTEGER CHECK (prompt_characters IS NULL OR prompt_characters >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_activity_user_created_idx
  ON public.user_activity (user_id, created_at DESC);

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own activity"
  ON public.user_activity FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can record their own activity"
  ON public.user_activity FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.user_activity TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity;
  END IF;
END;
$$;

CREATE TABLE public.anonymous_telemetry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name TEXT NOT NULL CHECK (event_name IN ('build_completed', 'project_pushed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.anonymous_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can submit anonymous telemetry"
  ON public.anonymous_telemetry FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT INSERT ON public.anonymous_telemetry TO anon, authenticated;
