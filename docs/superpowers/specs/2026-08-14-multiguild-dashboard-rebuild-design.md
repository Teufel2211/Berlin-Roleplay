# Design: Multi-Guild Dashboard Rebuild (Emergency Hamburg Roleplay)

Datum: 2026-08-14
Status: Freigegeben durch User (2026-08-14)

## Ziel

Kompletter Rebuild des Dashboards + Multi-Guild-Umbau des Bots für die Community „Emergency Hamburg Roleplay". Alte Single-Guild-Logik (fester `GUILD_ID`) wird durch ein Multi-Guild-System ersetzt: Ein Bot-Prozess, beliebig viele Server, eigene Einstellungen pro Server, zentrale Server-Auswahl im Dashboard.

## Architektur (unverändert)

Ein Node.js-Prozess (discord.js v14, CommonJS): Discord-Bot + Express/EJS-Dashboard auf einem Port. Daten in Supabase (`hfreshlzwukfaeyveddv`), alle Tabellen mit `eghr_`-Präfix. Nur der Service-Role-Key (Bot) hat Zugriff; RLS bleibt aktiv, keine Policies.

## Phase 1 — Multi-Guild-Backend

### DB-Schema (001_init.sql wird ersetzt; Drop-Loop löscht NUR `eghr\_%`-Tabellen)

Neue `guild_id text not null` Spalten:

| Tabelle | Änderung |
|---|---|
| `eghr_warteraum` | + `guild_id`, PK wird `(guild_id, discord_id)` |
| `eghr_users` | + `guild_id`, PK wird `(guild_id, discord_id)` |
| `eghr_giveaways` | + `guild_id` |
| `eghr_giveaway_participants` | unverändert (FK auf Giveaway) |
| `eghr_counting_stats` | + `guild_id`, PK wird `(guild_id, discord_id)` |
| `eghr_counting_state` | PK wird `guild_id` (statt `id`) |
| `eghr_applications` | + `guild_id` |
| `eghr_tickets` | + `guild_id` |
| `eghr_ticket_transcripts` | unverändert (FK auf Ticket) |
| `eghr_audit_log` | + `guild_id` |
| `eghr_settings` | PK wird `(guild_id, key)` |
| `eghr_sessions` | unverändert |
| `eghr_admin_codes` | **ENTFALLT** (Code-Login wird entfernt) |

Neue Tabellen:

```sql
eghr_embeds (
  id bigint PK, guild_id text not null, name text not null,
  data jsonb not null, channel_id text, message_id text,
  created_at timestamptz default now()
);

eghr_interviews (
  id bigint PK, guild_id text not null, applicant_id text not null,
  applicant_name text, status text default 'offen',  -- offen | fertig
  scores jsonb not null default '{}',                 -- {frageId: 0.5}
  total numeric, passed boolean,
  created_at timestamptz default now()
);

eghr_interview_questions (
  id bigint PK, guild_id text not null, section integer not null,
  frage text not null, sort integer not null
);
```

### Default-Einstellungen (je Server)

Pro Server-Setup werden Defaults angelegt (Staff/Admin-Rolle, Kanäle leer, Interview-Schwelle `45`, Interview max. pro Abschnitt `20`, Fragebogen-Vorlage mit den 30 Fragen in 3 Abschnitten à 10).

### settingsService

- Methoden bekommen `guildId`: `get(guildId, key)`, `getAll(guildId)`, `setMany(guildId, entries)`
- Cache je Guild (Map<guildId, Map<key, value>>)
- `ensureGuildDefaults(guildId)`: legt fehlende Settings + Fragebogen-Vorlage an

### Bot

- `GUILD_ID` aus `REQUIRED_SECRETS` entfernen (bleibt optional als Legacy-Fallback)
- Slash-Commands **global** registrieren (`scripts/deploy.js` und `src/discord/deploy.js`)
- Jedes Command nutzt `interaction.guildId`; ist der Server unbekannt/nicht eingerichtet → freundliche Meldung mit Hinweis auf Dashboard
- Alle Services (`verify`, `warteraum`, `counting`, `giveaway`, `application`, `ticket`) bekommen `guildId` als Parameter
- `helpers.js`: Rollen-/Kanal-Auflösung je Guild
- Neue Multi-Rollen-Unterstützung: Rollen-Settings als JSON-Array von Rollen-IDs oder -Namen (Settings wie `staff_roles`, `admin_roles`, `verified_roles`, `warteraum_roles`, `giveaway_required_roles`). Alte Einzel-Settings werden abgelöst; Helper akzeptieren beides beim Lesen (Rückwärtskompatibel)
- Bot-Status (Ready/Präsenz) korrekt setzen und `/api/status` je Guild auswerten

### Auth & Sessions

- Code-Login komplett entfernen: `adminCode.js`, `eghr_admin_codes`, `DASHBOARD_USER`/`DASHBOARD_PASSWORD_HASH`, Routes `/dashboard/login/code*`, Settings-Gate, `settingsUnlocked`-Logik
- Nur noch Discord-OAuth (`identify` + `guilds` Scope), jeder Discord-Nutzer darf sich einloggen
- Session speichert: `user` (id, username, global_name, avatar), `accessToken`, `refreshToken`, `tokenExpires`
- Token-Refresh bei Bedarf (Fetch nach Ablauf)

### Zugriffskontrolle pro Server

- Server-Auswahl: Server aus OAuth-`/users/@me/guilds`, wo `owner` ODER `MANAGE_GUILD`-Permission (Bit `0x20`)
- Konfiguration ansehen/ändern: zusätzlich Staff- oder Admin-Rolle in diesem Server ODER Owner
- Owner (`config.ownerUserId`) hat Vollzugriff auf alle Server

## Phase 2 — Neues Dashboard

### Seiten

1. **Landing Page** (`/`): Kopfzeile mit Logo + „Login"-Button oben rechts. Linke Spalte: scrollbare Liste aller Features (Name + Symbol). Rechte Spalte: kurze Beschreibung des ausgewählten Features (JS-Interaktion). Unterseite: Footer.
2. **Server-Auswahl** (`/dashboard`): Karten-Grid aller Server, wo der Nutzer Owner/MANAGE_GUILD hat. Icon + Name. Bot nicht drauf → „Bot hinzufügen"-Button (Standard-Invite-URL mit `permissions=0`). Bot drauf → klickbar zur Server-Seite.
3. **Server-Seite** (`/dashboard/servers/:guildId`): 
   - Kopf: oben links Server-Icon + Servername, darunter kleiner die Server-ID
   - Horizontale schwarze Trennlinie unter dem Kopf
   - Linke vertikale schwarze Trennlinie: Feature-Sidebar (alle Features mit Symbol + Name untereinander)
   - Klick auf Feature → Feature-Menü öffnet sich rechts mit allen Einstellungen, gruppiert in **Unterkategorien**

### Feature-Sidebar-Einträge

Verifizierung, Warteraum, Counting, Giveaway, Tickets, Bewerbung, Interview, Embed-Builder, Audit-Log, Übersicht.

### Settings mit Unterkategorien

Jedes Feature hat Gruppen, z.B. Verifizierung: „Kanäle", „Rollen", „Verhalten". Rollen-Einstellungen sind Multi-Select (mehrere Rollen pro Auswahl).

### Views

- `views/landing.ejs`, `views/guilds.ejs`, `views/server.ejs` (Layout mit Sidebar + Feature-Inhalt), bestehende Views (dashboard/verification/tickets/tickets_detail/applications/audit) werden in die neue Server-Seite integriert.
- Partials: `head.ejs`, `foot.ejs`, `feature_sidebar.ejs`

### CSS

`public/css/style.css` komplett neu (dark Theme passend zur Community), responsiv, schwarze Trennlinien wie spezifiziert.

## Phase 3 — Neue Features

### Embed-Builder

- Dashboard-Editor (Server-Seite → Feature „Embed-Builder"):
  - Name, Titel, Beschreibung, Farbe (Color-Picker/Hex), Felder (Name/Wert/inline), Bild-URL, Footer, Timestamp
  - Buttons: pro Button Stil (Primary/Secondary/Success/Danger/Link), Label, Emoji, URL (bei Link)
  - Live-Vorschau (Discord-Embed-Darstellung)
  - Speichern in `eghr_embeds`, Kanal auswählen → Bot postet Embed per REST in den Kanal; `message_id` + `channel_id` werden gespeichert
  - Vorhandenes Embed: „Aktualisieren" (Bot editiert die Nachricht) oder „Neu posten"

### Voice-Interview (überarbeitet)

- `/interview starten <user> [kanal]` (Staff/Admin): 
  - Kein Voice-Join, kein Audio-Recording
  - Bot schreibt eine **Nachricht in den Kanal** (Standard: Bewerbungs-Kanal bzw. konfigurierter Interview-Kanal)
  - Nachricht zeigt Fragebogen (Abschnitte 1–3), pro Frage Bewertungs-Buttons: `0`, `0,5`, `1`, `1,5`, `2`
  - Fortschrittsanzeige (x/30 Fragen bewertet)
  - Sobald alle Fragen bewertet: untere Zeile mit **Gesamtpunktzahl (z.B. 47/60)** und **„Bestanden" / „Nicht bestanden"** (Schwelle konfigurierbar, Default 45)
  - **Nachträglich änderbar**: Staff klickt spätere Buttons, Werte werden neu berechnet und die Nachricht wird aktualisiert
  - Gespeichert in `eghr_interviews`; Verlauf + Detail im Dashboard (Feature „Interview")
- Dashboard: Fragenliste pro Server editierbar (Abschnitt, Frage, Reihenfolge), Schwelle + Max-Punkte pro Abschnitt konfigurierbar, Ergebnisliste (Score, Bestanden, Datum)

## Sicherheit

- CSRF (Token + Origin-Check) bleibt, Rate-Limiting bleibt
- Server-seitige Rechteprüfung auf jeder Dashboard-Route (`MANAGE_GUILD`/Owner → Seite; Staff/Admin → Settings)
- Keine Secrets im Frontend
- Embed-Daten als JSON validiert; HTML in EJS escaped
- Keine Code-Login-Schwachstelle mehr (entfernt)

## Verifikation

- `npm run lint` muss laufen (alle JS/EJS/SQL)
- Smoke-Test: Landing Page (200), Login, Server-Auswahl, Server-Seite, API `/api/status`
- DB: Migration auf leere `eghr_`-Tabellen anwendbar, keine Fremdtabellen betroffen

## Nicht-Ziele (bewusst)

- Kein Audio-Recording in Interviews
- Kein automatisches Bewerten durch KI
- Keine Deaktivierung von RLS/Policies
