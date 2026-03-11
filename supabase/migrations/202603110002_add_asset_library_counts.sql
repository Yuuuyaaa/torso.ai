alter table public.app_asset_libraries
  add column if not exists studio_count integer not null default 0,
  add column if not exists model_count integer not null default 0,
  add column if not exists product_count integer not null default 0;

update public.app_asset_libraries
set
  studio_count = coalesce(jsonb_array_length(coalesce(studio_assets, '[]'::jsonb)), 0),
  model_count = coalesce(jsonb_array_length(coalesce(model_assets, '[]'::jsonb)), 0),
  product_count = coalesce(jsonb_array_length(coalesce(product_assets, '[]'::jsonb)), 0)
where
  studio_count is distinct from coalesce(jsonb_array_length(coalesce(studio_assets, '[]'::jsonb)), 0)
  or model_count is distinct from coalesce(jsonb_array_length(coalesce(model_assets, '[]'::jsonb)), 0)
  or product_count is distinct from coalesce(jsonb_array_length(coalesce(product_assets, '[]'::jsonb)), 0);
