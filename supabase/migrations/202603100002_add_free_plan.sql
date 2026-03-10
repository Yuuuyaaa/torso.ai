insert into public.app_plans (plan_id, name, monthly_credits, high_quality_enabled)
values ('free', 'Free', 0, false)
on conflict (plan_id) do update
set
  name = excluded.name,
  monthly_credits = excluded.monthly_credits,
  high_quality_enabled = excluded.high_quality_enabled;
