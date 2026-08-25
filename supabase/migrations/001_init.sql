-- 001_init.sql — Multi-Guild-Schema (eghr_-Präfix)
-- Löscht NUR bestehende eghr_-Tabellen; keine anderen Tabellen des Projekts werden angefasst.
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
  guild_id text not null,
  discord_id text not null,
  position integer not null,
  joined_at timestamptz default now(),
  primary key (guild_id, discord_id)
);

create table if not exists public.eghr_users (
  guild_id text not null,
  discord_id text not null,
  username text,
  verified_at timestamptz,
  left_at timestamptz,
  primary key (guild_id, discord_id)
);

create table if not exists public.eghr_giveaways (
  id bigint generated always as identity primary key,
  guild_id text not null,
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

create table if not exists public.eghr_applications (
  id bigint generated always as identity primary key,
  guild_id text not null,
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
  guild_id text not null,
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
  guild_id text,
  ticket_id bigint references public.eghr_tickets(id) on delete cascade,
  created_by text,
  ticket_owner text,
  status text,
  transcript_type text,
  storage_path text,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.eghr_audit_log (
  id bigint generated always as identity primary key,
  guild_id text,
  actor text,
  action text not null,
  detail jsonb,
  created_at timestamptz default now()
);

create table if not exists public.eghr_settings (
  guild_id text not null,
  key text not null,
  value text not null,
  updated_at timestamptz default now(),
  primary key (guild_id, key)
);

create table if not exists public.eghr_sessions (
  sid text primary key,
  sess jsonb not null,
  expire timestamptz not null
);

create index if not exists eghr_sessions_expire_idx on public.eghr_sessions (expire);

create table if not exists public.eghr_embeds (
  id bigint generated always as identity primary key,
  guild_id text not null,
  name text not null,
  data jsonb not null,
  channel_id text,
  message_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.eghr_interviews (
  id bigint generated always as identity primary key,
  guild_id text not null,
  applicant_id text not null,
  applicant_name text,
  status text default 'offen',
  scores jsonb not null default '{}',
  total numeric,
  passed boolean,
  channel_id text,
  message_id text,
  created_at timestamptz default now()
);

create table if not exists public.eghr_interview_questions (
  id bigint generated always as identity primary key,
  guild_id text not null,
  section integer not null,
  frage text not null,
  sort integer not null
);

-- RLS aktivieren (Service-Role-Key umgeht RLS; keine Policies -> anon/authenticated haben keinen Zugriff)
alter table public.eghr_warteraum enable row level security;
alter table public.eghr_users enable row level security;
alter table public.eghr_giveaways enable row level security;
alter table public.eghr_giveaway_participants enable row level security;
alter table public.eghr_applications enable row level security;
alter table public.eghr_tickets enable row level security;
alter table public.eghr_ticket_transcripts enable row level security;
alter table public.eghr_audit_log enable row level security;
alter table public.eghr_settings enable row level security;
alter table public.eghr_sessions enable row level security;
alter table public.eghr_embeds enable row level security;
alter table public.eghr_interviews enable row level security;
alter table public.eghr_interview_questions enable row level security;
