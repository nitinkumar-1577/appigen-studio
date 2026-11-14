create or replace function public.get_appigen_usage_metrics()
returns table (apps_created bigint, prompt_characters bigint, average_build_time_ms numeric, completed_builds bigint)
language sql stable security invoker set search_path = public
as $$
  select
    (select count(*) from public.projects p where p.user_id = auth.uid()) as apps_created,
    coalesce(sum(a.prompt_characters) filter (where a.kind in ('build', 'edit')), 0)::bigint as prompt_characters,
    avg(a.duration_ms) filter (where a.kind in ('build', 'edit')) as average_build_time_ms,
    count(*) filter (where a.kind in ('build', 'edit'))::bigint as completed_builds
  from public.user_activity a where a.user_id = auth.uid();
$$;
revoke all on function public.get_appigen_usage_metrics() from public, anon;
grant execute on function public.get_appigen_usage_metrics() to authenticated;
