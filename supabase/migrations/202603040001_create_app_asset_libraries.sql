-- Supabase migration: persistent asset library for model/studio/product assets

create table if not exists public.app_asset_libraries (
  user_id text primary key,
  studio_assets jsonb not null default '[]'::jsonb,
  model_assets jsonb not null default '[]'::jsonb,
  product_assets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_asset_libraries_updated_at on public.app_asset_libraries;
create trigger trg_app_asset_libraries_updated_at
before update on public.app_asset_libraries
for each row
execute function public.set_updated_at();

alter table public.app_asset_libraries enable row level security;

drop policy if exists "app_asset_libraries_select_own" on public.app_asset_libraries;
create policy "app_asset_libraries_select_own"
on public.app_asset_libraries
for select
to authenticated
using (user_id = auth.uid()::text);

drop policy if exists "app_asset_libraries_insert_own" on public.app_asset_libraries;
create policy "app_asset_libraries_insert_own"
on public.app_asset_libraries
for insert
to authenticated
with check (user_id = auth.uid()::text);

drop policy if exists "app_asset_libraries_update_own" on public.app_asset_libraries;
create policy "app_asset_libraries_update_own"
on public.app_asset_libraries
for update
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);
