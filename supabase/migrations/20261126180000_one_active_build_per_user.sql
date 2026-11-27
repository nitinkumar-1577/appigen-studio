CREATE UNIQUE INDEX IF NOT EXISTS build_jobs_one_active_per_user
ON public.build_jobs (user_id)
WHERE status IN ('queued', 'running', 'retrying');

