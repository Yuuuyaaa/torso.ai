create table if not exists public.app_billing_customers (
  user_id text primary key references public.app_users(user_id) on delete cascade,
  stripe_customer_id text not null unique,
  billing_email text not null default '',
  default_payment_method_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_billing_customers_updated_at on public.app_billing_customers;
create trigger trg_app_billing_customers_updated_at
before update on public.app_billing_customers
for each row
execute function public.set_updated_at();

create table if not exists public.app_billing_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  user_id text references public.app_users(user_id) on delete set null,
  object_id text,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed', 'ignored')),
  processed boolean not null default false,
  processed_at timestamptz,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_billing_webhook_events_user_created
  on public.app_billing_webhook_events(user_id, created_at desc);

create index if not exists idx_app_billing_webhook_events_type_created
  on public.app_billing_webhook_events(event_type, created_at desc);

alter table public.app_billing_customers enable row level security;
alter table public.app_billing_webhook_events enable row level security;

drop policy if exists "app_billing_customers_all_own" on public.app_billing_customers;
create policy "app_billing_customers_all_own"
on public.app_billing_customers
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists "app_billing_webhook_events_select_own" on public.app_billing_webhook_events;
create policy "app_billing_webhook_events_select_own"
on public.app_billing_webhook_events
for select
to authenticated
using (user_id = auth.uid()::text);
