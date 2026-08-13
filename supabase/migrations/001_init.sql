-- 001_init.sql — Tabellen + Default-Settings (eghr_-Präfix)
-- Bestehende eghr_-Tabellen entfernen (falls vorhanden)
do $$
declare
  t text;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public' and tablename like 'eghr\_%'
  loop
    execute format('drop table if exists public.%I cascade', t);
  end loop;
end $$;

create table if not exists public.eghr_warteraum (
  discord_id text primary key,
  position integer not null,
  joined_at timestamptz default now()
);

create table if not exists public.eghr_users (
  discord_id text primary key,
  username text,
  verified_at timestamptz,
  left_at timestamptz
);

create table if not exists public.eghr_giveaways (
  id bigint generated always as identity primary key,
  message_id text,
  channel_id text,
  prize text not null,
  winners_count integer default 1,
  participant_count integer default 0,
  ends_at timestamptz not null,
  ended boolean default false,
  host_id text,
  created_at timestamptz default now()
);

create table if not exists public.eghr_giveaway_participants (
  giveaway_id bigint not null references public.eghr_giveaways(id) on delete cascade,
  discord_id text not null,
  username text,
  joined_at timestamptz default now(),
  primary key (giveaway_id, discord_id)
);

create table if not exists public.eghr_counting_stats (
  discord_id text primary key,
  count bigint default 0,
  wrong_counts bigint default 0
);

create table if not exists public.eghr_counting_state (
  id boolean primary key default true,
  current_number bigint default 0,
  last_user_id text,
  streak integer default 0,
  best_streak integer default 0
);

create table if not exists public.eghr_applications (
  id bigint generated always as identity primary key,
  discord_id text not null,
  type text not null,
  answers jsonb not null,
  channel_id text,
  message_id text,
  status text default 'offen',
  created_at timestamptz default now()
);

create table if not exists public.eghr_tickets (
  id bigint generated always as identity primary key,
  channel_id text unique,
  owner_id text not null,
  topic text,
  status text default 'offen',
  claimed_by text,
  close_reason text,
  closed_by text,
  created_at timestamptz default now()
);

create table if not exists public.eghr_ticket_transcripts (
  id bigint generated always as identity primary key,
  ticket_id bigint references public.eghr_tickets(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.eghr_audit_log (
  id bigint generated always as identity primary key,
  actor text,
  action text not null,
  detail jsonb,
  created_at timestamptz default now()
);

create table if not exists public.eghr_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

create table if not exists public.eghr_sessions (
  sid text primary key,
  sess jsonb not null,
  expire timestamptz not null
);

create index if not exists eghr_sessions_expire_idx on public.eghr_sessions (expire);

create table if not exists public.eghr_admin_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  user_id text not null,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists eghr_admin_codes_user_idx on public.eghr_admin_codes (user_id);
create index if not exists eghr_admin_codes_expires_idx on public.eghr_admin_codes (expires_at);

-- RLS aktivieren (Service-Role-Key umgeht RLS; keine Policies -> anon/authenticated haben keinen Zugriff)
alter table public.eghr_warteraum enable row level security;
alter table public.eghr_users enable row level security;
alter table public.eghr_giveaways enable row level security;
alter table public.eghr_giveaway_participants enable row level security;
alter table public.eghr_counting_stats enable row level security;
alter table public.eghr_counting_state enable row level security;
alter table public.eghr_applications enable row level security;
alter table public.eghr_tickets enable row level security;
alter table public.eghr_ticket_transcripts enable row level security;
alter table public.eghr_audit_log enable row level security;
alter table public.eghr_settings enable row level security;
alter table public.eghr_sessions enable row level security;
alter table public.eghr_admin_codes enable row level security;

-- Default-Einstellungen
insert into public.eghr_settings (key, value) values
  ('staff_role', 'Staff'),
  ('admin_role', 'Admin'),
  ('warteraum_role', 'Warteraum'),
  ('verified_role', ''),
  ('verify_channel_id', ''),
  ('verify_dm', 'true'),
  ('verify_log_channel_id', ''),
  ('counting_channel_id', ''),
  ('counting_decimal', 'false'),
  ('counting_target', ''),
  ('counting_milestones_enabled', 'true'),
  ('counting_milestone_channel_id', ''),
  ('ticket_category_id', ''),
  ('ticket_panel_channel_id', ''),
  ('ticket_log_channel_id', ''),
  ('max_open_tickets', '1'),
  ('ticket_transcripts_enabled', 'true'),
  ('application_category_id', ''),
  ('application_cooldown_days', '30'),
  ('application_staff_ping', 'true'),
  ('application_questions', ''),
  ('giveaway_channel_id', ''),
  ('giveaway_default_winners', '1'),
  ('giveaway_required_role', ''),
  ('giveaway_announce_channel_id', ''),
  ('warteraum_voice_channel_id', ''),
  ('warteraum_target_channel_id', '')
on conflict (key) do nothing;
