-- Phase 6: shared backend infrastructure for generated apps (additive, tenant-isolated)
-- AppiGen's own tables (projects, project_versions, user_activity, anonymous_telemetry) remain separate.

create table if not exists public.generated_apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  appigen_project_id uuid references public.projects(id) on delete set null,
  name text not null default 'Untitled Generated App',
  backend_mode text not null check (backend_mode in ('shared', 'dedicated')) default 'shared',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_app_backend_configs (
  id uuid primary key default gen_random_uuid(),
  generated_app_id uuid not null references public.generated_apps(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('shared', 'dedicated')),
  -- Dedicated mode metadata (no secrets). Shared mode uses AppiGen shared resources.
  dedicated_project_ref text,
  dedicated_project_url text,
  dedicated_anon_key_hint text,
  provisioning_status text not null default 'not_configured',
  provisioning_error text,
  last_health_status text,
  last_health_checked_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (generated_app_id)
);

create table if not exists public.generated_app_env_vars (
  id uuid primary key default gen_random_uuid(),
  generated_app_id uuid not null references public.generated_apps(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  is_secret boolean not null default false,
  -- Public/non-secret values may be stored for config; secret values must be stored server-side/encrypted only.
  public_value text,
  secret_ref text, -- reference/id to server-side secret store; never the secret itself
  target text not null default 'runtime' check (target in ('runtime','build','both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (generated_app_id, key, target)
);

create table if not exists public.generated_app_deployments (
  id uuid primary key default gen_random_uuid(),
  generated_app_id uuid not null references public.generated_apps(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'vercel',
  status text not null default 'pending',
  repo_full_name text,
  deployment_url text,
  provider_deployment_id text,
  logs text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shared-mode tenant-isolated application data store.
-- Each row belongs to exactly one generated app and owner; RLS prevents cross-app access.
create table if not exists public.generated_app_data (
  id uuid primary key default gen_random_uuid(),
  generated_app_id uuid not null references public.generated_apps(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection text not null,
  record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_apps_owner_idx on public.generated_apps(owner_id, updated_at desc);
create index if not exists generated_app_backend_configs_owner_idx on public.generated_app_backend_configs(owner_id, generated_app_id);
create index if not exists generated_app_env_vars_owner_idx on public.generated_app_env_vars(owner_id, generated_app_id);
create index if not exists generated_app_deployments_owner_idx on public.generated_app_deployments(owner_id, generated_app_id, created_at desc);
create index if not exists generated_app_data_tenant_idx on public.generated_app_data(generated_app_id, owner_id, collection, updated_at desc);

alter table public.generated_apps enable row level security;
alter table public.generated_app_backend_configs enable row level security;
alter table public.generated_app_env_vars enable row level security;
alter table public.generated_app_deployments enable row level security;
alter table public.generated_app_data enable row level security;

-- Strict per-owner isolation (and app scoping via ownership chain).
drop policy if exists generated_apps_select on public.generated_apps;
create policy generated_apps_select on public.generated_apps for select to authenticated using (owner_id = auth.uid());
drop policy if exists generated_apps_insert on public.generated_apps;
create policy generated_apps_insert on public.generated_apps for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists generated_apps_update on public.generated_apps;
create policy generated_apps_update on public.generated_apps for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists generated_apps_delete on public.generated_apps;
create policy generated_apps_delete on public.generated_apps for delete to authenticated using (owner_id = auth.uid());

drop policy if exists generated_app_backend_configs_all on public.generated_app_backend_configs;
create policy generated_app_backend_configs_all on public.generated_app_backend_configs for all to authenticated
  using (owner_id = auth.uid() and exists (select 1 from public.generated_apps a where a.id = generated_app_id and a.owner_id = auth.uid()))
  with check (owner_id = auth.uid() and exists (select 1 from public.generated_apps a where a.id = generated_app_id and a.owner_id = auth.uid()));

drop policy if exists generated_app_env_vars_all on public.generated_app_env_vars;
create policy generated_app_env_vars_all on public.generated_app_env_vars for all to authenticated
  using (owner_id = auth.uid() and exists (select 1 from public.generated_apps a where a.id = generated_app_id and a.owner_id = auth.uid()))
  with check (owner_id = auth.uid() and exists (select 1 from public.generated_apps a where a.id = generated_app_id and a.owner_id = auth.uid()));

drop policy if exists generated_app_deployments_all on public.generated_app_deployments;
create policy generated_app_deployments_all on public.generated_app_deployments for all to authenticated
  using (owner_id = auth.uid() and exists (select 1 from public.generated_apps a where a.id = generated_app_id and a.owner_id = auth.uid()))
  with check (owner_id = auth.uid() and exists (select 1 from public.generated_apps a where a.id = generated_app_id and a.owner_id = auth.uid()));

drop policy if exists generated_app_data_all on public.generated_app_data;
create policy generated_app_data_all on public.generated_app_data for all to authenticated
  using (owner_id = auth.uid() and generated_app_id in (select id from public.generated_apps where owner_id = auth.uid()))
  with check (owner_id = auth.uid() and generated_app_id in (select id from public.generated_apps where owner_id = auth.uid()));

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_generated_apps_updated_at on public.generated_apps;
create trigger trg_generated_apps_updated_at before update on public.generated_apps for each row execute function public.set_updated_at();
drop trigger if exists trg_generated_app_backend_configs_updated_at on public.generated_app_backend_configs;
create trigger trg_generated_app_backend_configs_updated_at before update on public.generated_app_backend_configs for each row execute function public.set_updated_at();
drop trigger if exists trg_generated_app_env_vars_updated_at on public.generated_app_env_vars;
create trigger trg_generated_app_env_vars_updated_at before update on public.generated_app_env_vars for each row execute function public.set_updated_at();
drop trigger if exists trg_generated_app_deployments_updated_at on public.generated_app_deployments;
create trigger trg_generated_app_deployments_updated_at before update on public.generated_app_deployments for each row execute function public.set_updated_at();
drop trigger if exists trg_generated_app_data_updated_at on public.generated_app_data;
create trigger trg_generated_app_data_updated_at before update on public.generated_app_data for each row execute function public.set_updated_at();
