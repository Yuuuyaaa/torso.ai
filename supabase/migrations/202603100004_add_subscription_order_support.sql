create table if not exists public.app_subscription_orders (
  order_id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(user_id) on delete cascade,
  plan_id text not null references public.app_plans(plan_id),
  interval text not null default 'month' check (interval in ('month', 'year')),
  amount_yen integer,
  status text not null default 'pending' check (status in ('draft', 'pending', 'active', 'past_due', 'failed', 'canceled')),
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  stripe_latest_invoice_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_subscription_orders_user_created
  on public.app_subscription_orders(user_id, created_at desc);

drop trigger if exists trg_app_subscription_orders_updated_at on public.app_subscription_orders;
create trigger trg_app_subscription_orders_updated_at
before update on public.app_subscription_orders
for each row
execute function public.set_updated_at();

alter table public.app_subscription_orders enable row level security;

drop policy if exists "app_subscription_orders_all_own" on public.app_subscription_orders;
create policy "app_subscription_orders_all_own"
on public.app_subscription_orders
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);
