alter table public.app_users
  add column if not exists subscription_credits integer not null default 0;

update public.app_users
set subscription_credits = least(
  coalesce(credits, 0),
  case coalesce(plan_id, 'free')
    when 'starter' then 30
    when 'growth' then 200
    when 'business' then 800
    when 'enterprise' then 2000
    when 'custom' then 2000
    else 0
  end
)
where subscription_credits is distinct from least(
  coalesce(credits, 0),
  case coalesce(plan_id, 'free')
    when 'starter' then 30
    when 'growth' then 200
    when 'business' then 800
    when 'enterprise' then 2000
    when 'custom' then 2000
    else 0
  end
);
