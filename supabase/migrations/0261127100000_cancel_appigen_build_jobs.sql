CREATE OR REPLACE FUNCTION public.cancel_appigen_build_job(
  p_job_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.build_jobs
  SET
    status = 'cancelled',
    current_stage = 'Stopped by user',
    error = 'Stopped by user',
    lease_until = NULL,
    heartbeat_at = now(),
    completed_at = now(),
    updated_at = now(),
    build_timeline =
      COALESCE(build_timeline, '[]'::jsonb)
      || jsonb_build_array('Stopped by user')
  WHERE
    id = p_job_id
    AND user_id = v_user_id
    AND status IN ('queued', 'running', 'retrying');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_appigen_build_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_appigen_build_job(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_appigen_build_job(uuid) TO authenticated;
