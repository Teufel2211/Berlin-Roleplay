-- 007: Ticket-Typen (Phase F)
-- Konfigurierbare Ticket-Typen: eigene Kategorie, eigenes Limit, optionale Ping-Rolle.
create table if not exists public.eghr_ticket_types (
  id bigint generated always as identity primary key,
  guild_id text not null,
  name text not null,
  emoji text default '🎫',
  category_id text,
  max_open integer default 1,
  ping_role_id text,
  sort integer default 0,
  created_at timestamptz default now()
);

alter table public.eghr_tickets
  add column if not exists type_id bigint references public.eghr_ticket_types(id) on delete set null;
