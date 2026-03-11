create table if not exists public.app_asset_events (
  event_id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(user_id) on delete cascade,
  asset_type text not null,
  asset_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_asset_events_user_created
  on public.app_asset_events(user_id, created_at desc);

create index if not exists idx_app_asset_events_asset_created
  on public.app_asset_events(asset_type, asset_id, created_at desc);
