ALTER TABLE public.build_jobs
  DROP CONSTRAINT IF EXISTS build_jobs_status_check;

ALTER TABLE public.build_jobs
  ADD CONSTRAINT build_jobs_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'queued',
        'running',
        'retrying',
        'paused',
        'completed',
        'failed',
        'cancelled'
      ]::text[]
    )
  );
