# Design: Ticket-Typen (Phase F, Tickets-Umbau)

Datum: 2026-08-16
Status: Freigegeben durch User (2026-08-16)

## Ziel

Das Ticket-Feature bekommt konfigurierbare **Ticket-Typen** (z. B. Support, Beschwerde, Bewerbung). Jeder Typ hat eine eigene Kategorie, ein eigenes Limit gleichzeitig offener Tickets und eine optionale Ping-Rolle. Die Auswahl passiert über ein **Dropdown** im bestehenden Panel. Server ohne konfigurierte Typen behalten das bisherige Verhalten (Fallback).

## Entscheidungen (mit User geklärt)

| Frage | Entscheidung |
|---|---|
| Umfang | Nur Ticket-Typen; kein Transkript-View, keine weitere Bot-Logik |
| Panel-Interaktion | Ein Panel, Dropdown (String-Select) mit allen Typen |
| Kategorie je Typ | Eigene Kategorie pro Typ; Kanal `ticket-<name>-<user>` |
| Limit | Eigenes Limit pro Typ (`max_open`), blockiert nur weitere Tickets desselben Typs |
| Staff-Ping | Optionale Ping-Rolle pro Typ, einmaliger Ping im neuen Ticket-Kanal |
| Panel-Nachrichten | Ein Panel + Dropdown aus allen Typen |
| Fallback | Keine Typen konfiguriert → altes Verhalten (`ticket_category_id`, `max_open_tickets`, Button `ticket_panel`) |

## Ansatz

Neue Tabelle `eghr_ticket_types` + FK `eghr_tickets.type_id` (Ansatz A — Rückwärtskompatibel, Muster wie Team-Ränge/Abteilungen).

## Datenmodell

```sql
create table if not exists public.eghr_ticket_types (
  id bigint generated always as identity primary key,
  guild_id text not null,
  name text not null,          -- z.B. "Support"
  emoji text default '🎫',
  category_id text,            -- eigene Kategorie je Typ
  max_open integer default 1,  -- eigenes Limit
  ping_role_id text,           -- optionale Ping-Rolle
  sort integer default 0,
  created_at timestamptz default now()
);

-- eghr_tickets:
--   add column if not exists type_id bigint references public.eghr_ticket_types(id) on delete set null;
```

- `type_id` ist optional (null = Alt-Verhalten).
- Migration `supabase/migrations/007_ticket_types.sql`.

## Bot-Verhalten

### `/ticket panel`

- Postet weiterhin **eine** Nachricht.
- Gibt es konfigurierte Typen: Embed + **String-Select-Dropdown** „Ticket öffnen" mit allen Typen (Optionen: `ticket_type_<id>`), sortiert nach `sort`.
- Keine Typen: alter Button `ticket_panel` (unverändert).

### Dropdown-Klick → `ticketService.handleTypeSelect(interaction)`

1. Typ laden (`ticket_type_<id>`), Guild prüfen.
2. Limit prüfen: Anzahl offener Tickets des Users mit diesem `type_id`; bei `>= max_open` Hinweis-Embed (ephemer).
3. Kanal erstellen: `ticket-<name>-<user>` in `category_id` des Typs; Berechtigungen wie bisher (Bot + User view/send, Staff-Rollen view/send, @everyone nichts).
4. Zeile in `eghr_tickets` mit `type_id` speichern.
5. Willkommens-Embed: nennt Typ (`🎫 <Typ>` statt „Support-Ticket") + Button „🔒 Ticket schließen".
6. Falls `ping_role_id` gesetzt: einmaliger Ping der Rolle im neuen Kanal.
7. Audit: `ticket.open` mit `id` + `type_id`.

### Claim/Unclaim/Schließen/Hinzufügen

- Unverändert. `closeTicket` aktualisiert weiterhin `close_reason`/`closed_by`; kein Typ-abhängiges Verhalten.

### Fallback (keine Typen)

- `handleOpen` (Button `ticket_panel`) unverändert: Kategorie `ticket_category_id`, Limit `max_open_tickets`, kein Typ-Name.

## Dashboard

### Neue Sektion „Ticket-Typen" (Feature Tickets, content)

- Tabelle: Name, Emoji, Kategorie, Limit, Ping-Rolle + Aktionen (↑/↓ sortieren, Bearbeiten, Löschen).
- „Typ hinzufügen"-Formular: Name (Pflicht), Emoji (Default 🎫), Kategorie (Kanal-Dropdown), Limit (Zahl, Default 1), Ping-Rolle (Rollen-Dropdown, optional). Sortierung ans Ende.
- Channel-/Role-Options aus bestehenden `channelOptions`/`roleOptions` (`server.js`).

### Settings

- Kanäle-Sektion bleibt: `ticket_panel_channel_id`, `ticket_log_channel_id`.
- `ticket_category_id` + `max_open_tickets` bleiben sichtbar als Fallback (gelten nur ohne Typen).

### Route

- `POST /dashboard/servers/:guildId/feature/tickets/action` (wie `managementAdmin`), Aktionen: `add_type`, `edit_type`, `delete_type`, `move_type`.
- Lädt je Server Typenliste (`ticketTypeService.list(gid)`), gibt sie als `data.ticketTypes` an `_tickets.ejs`.

## i18n

- de + en: `sec.tickets.typen`, Labels für Typ-Formular (`label.ticket_type_name`, etc.).
- Discord-Nachrichten bleiben wie im Rest des Bots Deutsch (inline, nicht über i18n).

## MASTERPROMPT

- Kapitel 10 (Ticket-Support) um Typen-Verhalten erweitern: Panel-Dropdown, pro-Typ-Limit/Kategorie/Ping, Fallback ohne Typen.

## Verifikation

- `npm run lint` (49 Dateien) grün.
- Render-Harness: alle Features + neue Typen-Sektion rendern.
- Migration 007 via MCP anwenden + Schema-Check (`information_schema.columns`).
- Commit + Push erst nach Freigabe durch User.

## Nicht-Ziele

- Kein Transkript-View im Dashboard (separate Phase möglich).
- Keine Ticket-Bewertung, kein Prioritäten-System.
- Keine Änderungen an Claim/Unclaim/Close-Logik.
