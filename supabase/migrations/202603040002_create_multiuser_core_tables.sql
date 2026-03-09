-- Supabase migration: multi-user core tables
-- Covers account, plan, assets, jobs, and credit history.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_plans (
  plan_id text primary key,
  name text not null,
  monthly_credits integer not null check (monthly_credits >= 0),
  high_quality_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.app_plans (plan_id, name, monthly_credits, high_quality_enabled)
values
  ('starter', 'Starter', 30, false),
  ('growth', 'Growth', 200, true),
  ('business', 'Business', 800, true),
  ('enterprise', 'Enterprise', 2000, true),
  ('custom', 'Custom', 2000, true)
on conflict (plan_id) do update
set
  name = excluded.name,
  monthly_credits = excluded.monthly_credits,
  high_quality_enabled = excluded.high_quality_enabled;

create table if not exists public.app_users (
  user_id text primary key,
  email text unique,
  display_name text not null default '',
  plan_id text not null references public.app_plans(plan_id) default 'growth',
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

create table if not exists public.app_user_settings (
  user_id text primary key references public.app_users(user_id) on delete cascade,
  locale text not null default 'ja-JP',
  timezone text not null default 'Asia/Tokyo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_user_settings_updated_at on public.app_user_settings;
create trigger trg_app_user_settings_updated_at
before update on public.app_user_settings
for each row
execute function public.set_updated_at();

create table if not exists public.app_assets (
  asset_id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(user_id) on delete cascade,
  asset_type text not null check (asset_type in ('product', 'model', 'studio')),
  name text not null,
  source_url text not null default '',
  output_url text not null default '',
  category text not null default 'unassigned',
  favorite boolean not null default false,
  built_in boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_app_assets_user_type_created
  on public.app_assets(user_id, asset_type, created_at desc);

create index if not exists idx_app_assets_user_favorite
  on public.app_assets(user_id, favorite)
  where deleted_at is null;

drop trigger if exists trg_app_assets_updated_at on public.app_assets;
create trigger trg_app_assets_updated_at
before update on public.app_assets
for each row
execute function public.set_updated_at();

create table if not exists public.app_jobs (
  job_id text primary key,
  user_id text not null references public.app_users(user_id) on delete cascade,
  style text not null,
  status text not null,
  output_preset text not null default 'default',
  style_config jsonb not null default '{}'::jsonb,
  background_asset_id uuid references public.app_assets(asset_id),
  model_asset_id uuid references public.app_assets(asset_id),
  model_run_strategy text not null default 'auto',
  credit_rate integer not null default 0,
  reserved_credits integer not null default 0,
  credit_used integer not null default 0,
  image_count integer not null default 0,
  processed_count integer not null default 0,
  success_count integer not null default 0,
  error_count integer not null default 0,
  retry_attempt integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_jobs_user_created
  on public.app_jobs(user_id, created_at desc);

drop trigger if exists trg_app_jobs_updated_at on public.app_jobs;
create trigger trg_app_jobs_updated_at
before update on public.app_jobs
for each row
execute function public.set_updated_at();

create table if not exists public.app_job_items (
  item_id text primary key,
  job_id text not null references public.app_jobs(job_id) on delete cascade,
  user_id text not null references public.app_users(user_id) on delete cascade,
  name text not null,
  relative_path text not null default '',
  sku_guess text not null default '',
  mime text not null default 'image/jpeg',
  status text not null default 'queued',
  error text,
  error_hint text,
  input_url text not null default '',
  output_url text not null default '',
  output_name text,
  output_sequence integer not null default 1,
  credit_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_job_items_job
  on public.app_job_items(job_id, output_sequence asc);

create index if not exists idx_app_job_items_user_status
  on public.app_job_items(user_id, status);

drop trigger if exists trg_app_job_items_updated_at on public.app_job_items;
create trigger trg_app_job_items_updated_at
before update on public.app_job_items
for each row
execute function public.set_updated_at();

create table if not exists public.app_job_events (
  event_id uuid primary key default gen_random_uuid(),
  job_id text not null references public.app_jobs(job_id) on delete cascade,
  user_id text not null references public.app_users(user_id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_job_events_job_created
  on public.app_job_events(job_id, created_at desc);

create table if not exists public.app_credit_events (
  event_id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(user_id) on delete cascade,
  event_type text not null,
  delta integer not null,
  balance_after integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_credit_events_user_created
  on public.app_credit_events(user_id, created_at desc);

alter table public.app_plans enable row level security;
alter table public.app_users enable row level security;
alter table public.app_user_settings enable row level security;
alter table public.app_assets enable row level security;
alter table public.app_jobs enable row level security;
alter table public.app_job_items enable row level security;
alter table public.app_job_events enable row level security;
alter table public.app_credit_events enable row level security;

drop policy if exists "app_plans_read_all" on public.app_plans;
create policy "app_plans_read_all"
on public.app_plans
for select
to authenticated
using (true);

drop policy if exists "app_users_select_own" on public.app_users;
create policy "app_users_select_own"
on public.app_users
for select
to authenticated
using (user_id = auth.uid()::text);

drop policy if exists "app_users_update_own" on public.app_users;
create policy "app_users_update_own"
on public.app_users
for update
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists "app_user_settings_all_own" on public.app_user_settings;
create policy "app_user_settings_all_own"
on public.app_user_settings
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists "app_assets_all_own" on public.app_assets;
create policy "app_assets_all_own"
on public.app_assets
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists "app_jobs_all_own" on public.app_jobs;
create policy "app_jobs_all_own"
on public.app_jobs
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists "app_job_items_all_own" on public.app_job_items;
create policy "app_job_items_all_own"
on public.app_job_items
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists "app_job_events_all_own" on public.app_job_events;
create policy "app_job_events_all_own"
on public.app_job_events
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists "app_credit_events_all_own" on public.app_credit_events;
create policy "app_credit_events_all_own"
on public.app_credit_events
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);
