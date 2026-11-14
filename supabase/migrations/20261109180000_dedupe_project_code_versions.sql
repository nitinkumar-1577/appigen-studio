CREATE OR REPLACE FUNCTION public.capture_project_code_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.code IS DISTINCT FROM NEW.code
    AND NOT EXISTS (
      SELECT 1
      FROM public.project_versions
      WHERE project_id = OLD.id
        AND code = OLD.code
    ) THEN
    INSERT INTO public.project_versions (project_id, user_id, code, prompt)
    VALUES (OLD.id, OLD.user_id, OLD.code, OLD.prompt);
  END IF;
  RETURN NEW;
END;
$$;
