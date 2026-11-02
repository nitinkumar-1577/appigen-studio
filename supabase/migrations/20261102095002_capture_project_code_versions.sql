CREATE OR REPLACE FUNCTION public.capture_project_code_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.code IS DISTINCT FROM NEW.code THEN
    INSERT INTO public.project_versions (project_id, user_id, code, prompt)
    VALUES (OLD.id, OLD.user_id, OLD.code, OLD.prompt);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_project_code_version ON public.projects;
CREATE TRIGGER capture_project_code_version
BEFORE UPDATE OF code ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.capture_project_code_version();
