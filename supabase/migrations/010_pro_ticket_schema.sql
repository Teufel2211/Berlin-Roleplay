-- 010: Fehlende Pro-Ticket-Tabellen + Spalten-Erweiterungen
-- Alle Tabellen die proTicketService.js braucht aber nie per Migration erstellt wurden.

-- ============================================================
-- PART 1: eghr_tickets erweitern (7 neue Spalten)
-- ============================================================
alter table public.eghr_tickets add column if not exists category_id bigint;
alter table public.eghr_tickets add column if not exists assigned_user_id text;
alter table public.eghr_tickets add column if not exists ticket_number integer;
alter table public.eghr_tickets add column if not exists tags jsonb not null default '[]';
alter table public.eghr_tickets add column if not exists last_activity_at timestamptz;
alter table public.eghr_tickets add column if not exists closed_at timestamptz;
alter table public.eghr_tickets add column if not exists deleted_at timestamptz;

create index if not exists eghr_tickets_guild_category_idx on public.eghr_tickets (guild_id, category_id);
create index if not exists eghr_tickets_guild_status_idx on public.eghr_tickets (guild_id, status);
create index if not exists eghr_tickets_guild_number_idx on public.eghr_tickets (guild_id, ticket_number);
create index if not exists eghr_tickets_guild_owner_idx on public.eghr_tickets (guild_id, owner_id);

-- ============================================================
-- PART 2: eghr_ticket_transcripts erweitern (6 neue Spalten)
-- ============================================================
alter table public.eghr_ticket_transcripts add column if not exists category_id bigint;
alter table public.eghr_ticket_transcripts add column if not exists assigned_user_id text;
alter table public.eghr_ticket_transcripts add column if not exists html_path text;
alter table public.eghr_ticket_transcripts add column if not exists message_count integer default 0;
alter table public.eghr_ticket_transcripts add column if not exists closed_at timestamptz;
alter table public.eghr_ticket_transcripts add column if not exists deleted_at timestamptz;

-- ============================================================
-- PART 3: eghr_ticket_settings (per-guild config)
-- ============================================================
create table if not exists public.eghr_ticket_settings (
  guild_id                 text primary key,
  prefix                   text not null default 'ticket',
  number_start             integer not null default 1,
  default_ticket_limit     integer not null default 1,
  auto_close_enabled       boolean not null default false,
  auto_close_hours         integer not null default 72,
  auto_close_warning_hours integer not null default 24,
  auto_delete_enabled      boolean not null default false,
  auto_delete_hours        integer not null default 24,
  transcript_enabled       boolean not null default true,
  transcript_on_close      boolean not null default true,
  transcript_on_delete     boolean not null default true,
  transcript_channel_id    text,
  log_channel_id           text,
  claim_single             boolean not null default true,
  admin_override_claim     boolean not null default false,
  updated_at               timestamptz default now()
);
alter table public.eghr_ticket_settings enable row level security;

-- ============================================================
-- PART 4: eghr_ticket_categories (Konfigurierbare Kategorien)
-- ============================================================
create table if not exists public.eghr_ticket_categories (
  id                    bigint generated always as identity primary key,
  guild_id              text not null,
  name                  text not null,
  description           text,
  emoji                 text default '🎫',
  category_channel_id   text,
  support_role_ids      jsonb not null default '[]',
  ticket_limit          integer not null default 1,
  prefix                text not null default 'ticket',
  color                 integer not null default 5793266,
  auto_close_enabled    boolean not null default false,
  auto_delete_enabled   boolean not null default false,
  transcript_enabled    boolean not null default true,
  dm_notifications      boolean not null default false,
  sort_order            integer not null default 0,
  enabled               boolean not null default true,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
create index if not exists eghr_ticket_categories_guild_idx on public.eghr_ticket_categories (guild_id, sort_order);
alter table public.eghr_ticket_categories enable row level security;

-- ============================================================
-- PART 5: eghr_ticket_panels (Discord Panel Embed Config)
-- ============================================================
create table if not exists public.eghr_ticket_panels (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  name         text not null default 'Standard Panel',
  channel_id   text,
  message_id   text,
  title        text default '🎫 Support',
  description  text default 'Wähle eine Kategorie, um ein Ticket zu erstellen.',
  color        integer not null default 5793266,
  thumbnail    text,
  banner       text,
  footer       text default 'Emergency Hamburg Roleplay',
  components   jsonb not null default '[]',
  enabled      boolean not null default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists eghr_ticket_panels_guild_idx on public.eghr_ticket_panels (guild_id, enabled);
alter table public.eghr_ticket_panels enable row level security;

-- ============================================================
-- PART 6: eghr_ticket_questions (Pre-Ticket Fragen)
-- ============================================================
create table if not exists public.eghr_ticket_questions (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  category_id  bigint,
  question     text not null,
  type         text not null default 'short',
  options      jsonb not null default '[]',
  required     boolean not null default true,
  sort_order   integer not null default 0,
  enabled      boolean not null default true,
  created_at   timestamptz default now()
);
create index if not exists eghr_ticket_questions_guild_cat_idx on public.eghr_ticket_questions (guild_id, category_id, sort_order);
alter table public.eghr_ticket_questions enable row level security;

-- ============================================================
-- PART 7: eghr_ticket_answers (Antworten auf Pre-Ticket Fragen)
-- ============================================================
create table if not exists public.eghr_ticket_answers (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  ticket_id    bigint not null references public.eghr_tickets(id) on delete cascade,
  question_id  bigint not null,
  answer       text,
  answered_by  text,
  created_at   timestamptz default now()
);
create index if not exists eghr_ticket_answers_ticket_idx on public.eghr_ticket_answers (ticket_id);
alter table public.eghr_ticket_answers enable row level security;

-- ============================================================
-- PART 8: eghr_ticket_tags (Wiederverwendbare Tags)
-- ============================================================
create table if not exists public.eghr_ticket_tags (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  name         text not null,
  emoji        text default '🏷️',
  color        integer not null default 8421504,
  description  text,
  enabled      boolean not null default true,
  created_at   timestamptz default now()
);
create index if not exists eghr_ticket_tags_guild_idx on public.eghr_ticket_tags (guild_id, name);
alter table public.eghr_ticket_tags enable row level security;

-- ============================================================
-- PART 9: eghr_ticket_events (Audit Trail)
-- ============================================================
create table if not exists public.eghr_ticket_events (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  ticket_id    bigint,
  event        text not null,
  actor_id     text,
  actor_tag    text,
  payload      jsonb not null default '{}',
  created_at   timestamptz default now()
);
create index if not exists eghr_ticket_events_guild_idx on public.eghr_ticket_events (guild_id, created_at desc);
alter table public.eghr_ticket_events enable row level security;

-- ============================================================
-- PART 10: eghr_ticket_members (Users in Ticket Channel)
-- ============================================================
create table if not exists public.eghr_ticket_members (
  guild_id     text not null,
  ticket_id    bigint not null references public.eghr_tickets(id) on delete cascade,
  user_id      text not null,
  added_by     text,
  created_at   timestamptz default now(),
  primary key (ticket_id, user_id)
);
alter table public.eghr_ticket_members enable row level security;

-- ============================================================
-- PART 11: eghr_ticket_assignments (Claim/Unclaim History)
-- ============================================================
create table if not exists public.eghr_ticket_assignments (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  ticket_id    bigint not null references public.eghr_tickets(id) on delete cascade,
  user_id      text not null,
  active       boolean not null default true,
  released_at  timestamptz,
  created_at   timestamptz default now()
);
create index if not exists eghr_ticket_assignments_ticket_idx on public.eghr_ticket_assignments (ticket_id, active);
create index if not exists eghr_ticket_assignments_guild_user_idx on public.eghr_ticket_assignments (guild_id, user_id);
alter table public.eghr_ticket_assignments enable row level security;

-- ============================================================
-- PART 12: eghr_ticket_archives (Gelöschte Tickets)
-- ============================================================
create table if not exists public.eghr_ticket_archives (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  ticket_id    bigint,
  archived_by  text,
  reason       text,
  created_at   timestamptz default now()
);
create index if not exists eghr_ticket_archives_guild_idx on public.eghr_ticket_archives (guild_id, created_at desc);
alter table public.eghr_ticket_archives enable row level security;

-- ============================================================
-- PART 13: eghr_ticket_transcript_messages (Einzelne Nachrichten im Transcript)
-- ============================================================
create table if not exists public.eghr_ticket_transcript_messages (
  id                bigint generated always as identity primary key,
  guild_id          text not null,
  ticket_id         bigint,
  message_id        text,
  author_id         text,
  author_username   text,
  author_avatar     text,
  content           text,
  attachments       jsonb not null default '[]',
  embeds            jsonb not null default '[]',
  created_at        timestamptz default now(),
  raw               jsonb
);
create index if not exists eghr_ticket_transcript_messages_ticket_idx on public.eghr_ticket_transcript_messages (ticket_id);
alter table public.eghr_ticket_transcript_messages enable row level security;

-- ============================================================
-- PART 14: Placeholder-Tabellen (nur in TABLES map, noch nicht aktiv)
-- ============================================================
create table if not exists public.eghr_ticket_automations (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  name         text not null,
  trigger_type text not null default 'message',
  action_type  text not null default 'close',
  config       jsonb not null default '{}',
  enabled      boolean not null default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.eghr_ticket_automations enable row level security;

create table if not exists public.eghr_ticket_permissions (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  role_id      text,
  user_id      text,
  permission   text not null,
  enabled      boolean not null default true,
  created_at   timestamptz default now()
);
alter table public.eghr_ticket_permissions enable row level security;

create table if not exists public.eghr_ticket_notifications (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  ticket_id    bigint,
  user_id      text not null,
  type         text not null default 'mention',
  message      text,
  read         boolean not null default false,
  created_at   timestamptz default now()
);
create index if not exists eghr_ticket_notifications_user_idx on public.eghr_ticket_notifications (user_id, read);
alter table public.eghr_ticket_notifications enable row level security;

create table if not exists public.eghr_ticket_statistics (
  id           bigint generated always as identity primary key,
  guild_id     text not null,
  stat_key     text not null,
  stat_value   jsonb not null default '{}',
  period       text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (guild_id, stat_key, period)
);
alter table public.eghr_ticket_statistics enable row level security;
