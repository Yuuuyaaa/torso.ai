alter table public.app_users
add column if not exists intro_pack_eligible boolean not null default true;

create table if not exists public.app_credit_pack_orders (
  order_id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(user_id) on delete cascade,
  plan_id text not null references public.app_plans(plan_id),
  pack_code text not null,
  credits integer not null check (credits > 0),
  amount_yen integer not null check (amount_yen >= 0),
  status text not null default 'pending' check (status in ('draft', 'pending', 'paid', 'failed', 'canceled')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_credit_pack_orders_user_created
  on public.app_credit_pack_orders(user_id, created_at desc);

drop trigger if exists trg_app_credit_pack_orders_updated_at on public.app_credit_pack_orders;
create trigger trg_app_credit_pack_orders_updated_at
before update on public.app_credit_pack_orders
for each row
execute function public.set_updated_at();

alter table public.app_credit_pack_orders enable row level security;

drop policy if exists "app_credit_pack_orders_all_own" on public.app_credit_pack_orders;
create policy "app_credit_pack_orders_all_own"
on public.app_credit_pack_orders
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);
