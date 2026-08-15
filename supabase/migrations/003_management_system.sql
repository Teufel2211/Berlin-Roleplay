create table if not exists public.eghr_team_departments (
  id bigint generated always as identity primary key,
  guild_id text not null,
  name text not null,
  description text,
  color text,
  sort integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.eghr_team_ranks (
  id bigint generated always as identity primary key,
  guild_id text not null,
  department_id bigint references public.eghr_team_departments(id) on delete set null,
  name text not null,
  discord_role_id text,
  permissions jsonb not null default '{}',
  sort integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.eghr_team_members (
  id bigint generated always as identity primary key,
  guild_id text not null,
  discord_id text not null,
  rank_id bigint references public.eghr_team_ranks(id) on delete set null,
  department_id bigint references public.eghr_team_departments(id) on delete set null,
  status text not null default 'aktiv',
  joined_at timestamptz default now(),
  notes text,
  application_id bigint references public.eghr_applications(id) on delete set null,
  interview_id bigint references public.eghr_interviews(id) on delete set null,
  unique(guild_id, discord_id)
);

create table if not exists public.eghr_team_absences (
  id bigint generated always as identity primary key,
  guild_id text not null,
  discord_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  approved_by text,
  created_at timestamptz default now()
);

create table if not exists public.eghr_team_events (
  id bigint generated always as identity primary key,
  guild_id text not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  department_id bigint references public.eghr_team_departments(id) on delete set null,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists public.eghr_team_tasks (
  id bigint generated always as identity primary key,
  guild_id text not null,
  title text not null,
  description text,
  assignee_id text,
  status text not null default 'offen',
  due_at timestamptz,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists public.eghr_moderation_cases (
  id bigint generated always as identity primary key,
  guild_id text not null,
  target_id text not null,
  moderator_id text not null,
  action text not null,
  reason text,
  duration_seconds bigint,
  created_at timestamptz default now()
);

create table if not exists public.eghr_moderation_warnings (
  id bigint generated always as identity primary key,
  guild_id text not null,
  target_id text not null,
  moderator_id text not null,
  reason text not null,
  points integer not null default 1,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.eghr_welcome_messages (
  id bigint generated always as identity primary key,
  guild_id text not null,
  channel_id text,
  dm_enabled boolean not null default false,
  embed_data jsonb not null default '{}',
  auto_role_ids jsonb not null default '[]',
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.eghr_verification_attempts (
  id bigint generated always as identity primary key,
  guild_id text not null,
  discord_id text not null,
  method text not null,
  success boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz default now()
);

alter table public.eghr_team_departments enable row level security;
alter table public.eghr_team_ranks enable row level security;
alter table public.eghr_team_members enable row level security;
alter table public.eghr_team_absences enable row level security;
alter table public.eghr_team_events enable row level security;
alter table public.eghr_team_tasks enable row level security;
alter table public.eghr_moderation_cases enable row level security;
alter table public.eghr_moderation_warnings enable row level security;
alter table public.eghr_welcome_messages enable row level security;
alter table public.eghr_verification_attempts enable row level security;
