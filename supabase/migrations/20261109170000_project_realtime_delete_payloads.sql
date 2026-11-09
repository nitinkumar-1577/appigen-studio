-- Realtime needs the previous ownership and project columns to refresh the
-- correct account's project/version lists after a row is deleted.
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.project_versions REPLICA IDENTITY FULL;
