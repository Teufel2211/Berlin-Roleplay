alter table public.eghr_giveaways
  add column if not exists name text not null default '',
  add column if not exists required_role_ids jsonb not null default '[]'::jsonb,
  add column if not exists excluded_role_ids jsonb not null default '[]'::jsonb,
  add column if not exists bonus_role_weights jsonb not null default '{}'::jsonb,
  add column if not exists requirements_text text not null default '',
  add column if not exists max_entries_per_user integer not null default 1;