# MASTERPROMPT — Discord-Bot + Website-Dashboard für die Community „Notruf Hamburg"

> **Zweck dieses Dokuments:** Dieses Masterprompt ist die vollständige, technische Anforderungsspezifikation für einen Discord-Bot inklusive Website-Dashboard. Eine KI (z.B. Claude, GPT) kann mit diesem Dokument den kompletten Bot programmieren. Alle Angaben sind verbindlich und so formuliert, dass sie ohne Rückfragen umsetzbar sind.
>
> **Ziel-Community:** Deutsche Community „Notruf Hamburg". Sprache im Bot, auf der Website und in allen Embeds ist **Deutsch**.

---

## 1. Projektüberblick

### 1.1 Was gebaut wird

Ein einziger **Node.js-Prozess**, der drei Aufgaben erfüllt:

1. **Discord-Bot** (discord.js v14) mit den Modulen: Verifizierung (Button), Warteraum (Voice-Queue), Giveaway, Counting, Bewerbung, Ticket-Support.
2. **Website-Dashboard** (Express, serverseitig gerenderte Seiten): Statistiken, offene Tickets/Bewerbungen, Verifizierungs-Status **und zentrale Einstellungsverwaltung**.

Bot und Website laufen im **selben Prozess** auf demselben Port und teilen sich eine **Supabase-Datenbank (PostgreSQL)**.

### 1.2 Verbindliche Technik

| Komponente | Technologie |
|---|---|
| Sprache/Laufzeit | Node.js 20+ (CommonJS) |
| Discord | `discord.js` v14 (intents: Guilds, GuildMembers, GuildMessages, MessageContent, GuildVoiceStates, GuildMessageReactions) |
| Website-Dashboard | `express` |
| Datenbank | **Supabase (PostgreSQL)** über `@supabase/supabase-js` (Service-Role-Key) — Daten liegen remote, keine lokale DB-Datei |
| Migrationen | SQL-Dateien in `supabase/migrations/`, angewendet per `npm run migrate` |
| Slash-Kommandos | Discord-Interactions, registriert per `REST` bei Start und per Deploy-Skript |
| Temporäre Dateien | `data/` (nur Ticket-Transkripte), `logs/` (Logs) |
| Konfiguration | **Secrets in `.env`**, alle übrigen Einstellungen in der Supabase-`settings`-Tabelle, verwaltet im Dashboard (Kapitel 3, 12) |

**Pakete (package.json, verbindlich):** `discord.js`, `express`, `@supabase/supabase-js`, `dotenv`, `node-fetch@2` (oder globales `fetch` in Node 20+), `winston` (Logging), `ejs` (Templates), `cookie-parser`/`express-session` (Session), `helmet` (Security-Header), `express-rate-limit` (Rate-Limiting, auch für Login), `bcryptjs` (Passwort-Hashing). Keine weiteren Abhängigkeiten ohne Notwendigkeit.

### 1.3 Rollen im Discord-Server

Konfigurierbar **über das Dashboard** (Supabase-`settings`-Tabelle, Kapitel 3.1 + 12). Beispielnamen:

| Einstellungs-Key | Zweck |
|---|---|
| `staff_role` | Zugriff auf Staff-Befehle (Giveaway, Tickets verwalten, Bewerbungen) |
| `admin_role` | Zugriff auf alle Verwaltungsbefehle inkl. Dashboard |
| `verified_role` | Wird nach Button-Verifizierung vergeben |
| `warteraum_role` | Mitglieder, die noch im Warteraum warten (optionales Label) |

Die Rollen werden **per Namen** gefunden (der Bot sucht die Rolle mit passendem Namen im Server). Wird eine Rolle nicht gefunden, loggt der Bot eine Warnung und der betreffende Befehl gibt eine freundliche Fehlermeldung aus.

---

## 2. Projektstruktur (verbindlich)

```
projekt-root/
├── package.json
├── .env.example          # Vorlage: nur Secrets (Kapitel 3)
├── .gitignore            # node_modules, .env, data/, logs/
├── supabase/
│   └── migrations/
│       └── 001_init.sql  # Tabellen + Default-Settings (Kapitel 4)
├── src/
│   ├── index.js          # Einstieg: Startet Discord-Bot + Express-Server
│   ├── config.js         # Liest .env (nur Secrets + Basiswerte)
│   ├── logger.js         # winston-Logger (Konsole + logs/app.log)
│   ├── supabase.js       # Supabase-Client-Init (Service-Role), Fehlerbehandlung
│   ├── discord/
│   │   ├── client.js     # Discord-Client-Setup, Login, Ready-Logik
│   │   ├── deploy.js     # Registriert alle Slash-Kommandos (REST)
│   │   ├── embeds.js     # Zentrale Embed-Builder (Design, siehe Kapitel 13)
│   │   ├── helpers.js    # Rollen-Suche, Kanal-Suche, Berechtigungs-Check
│   │   └── events.js     # ready, messageCreate (Counting), guildMemberAdd/Remove
│   ├── commands/
│   │   ├── verify.js         # /verify panel, /verify status, /verify entfernen
│   │   ├── warteraum.js      # /warteraum hinzufügen, /warteraum liste, /warteraum raus
│   │   ├── giveaway.js       # /giveaway starten, enden, verlängern, neu, teilnehmer, abbrechen, liste
│   │   ├── counting.js       # /counting leaderboard, stats, set, ziel, reset
│   │   ├── application.js    # /bewerbung, /bewerbung schließen, /bewerbung liste
│   │   ├── ticket.js         # /ticket panel, claim, unclaim, schließen, hinzufügen
│   │   └── admin.js          # /setup, /rollen, /dashboard url
│   ├── services/
│   │   ├── verifyService.js      # Panel-Posting, Button-Handling, Rollen-Vergabe
│   │   ├── settingsService.js   # Cache-gepufferter Zugriff auf die settings-Tabelle (Kapitel 3.1)
│   │   ├── warteraumService.js  # Queue-Logik (Reihenfolge, Voice-Verschiebung)
│   │   ├── giveawayService.js   # Gewinner-Ziehung, Ablauf-Check, Teilnehmer-Verwaltung
│   │   ├── countingService.js   # Zähl-Logik, Meilensteine, Streak, Leaderboard
│   │   ├── applicationService.js# Bewerbungs-Formular, Cooldown, Abstimmung
│   │   ├── ticketService.js     # Ticket-Erstellung, Claim, Transkripte
│   │   └── auditService.js      # Schreibt audit_log-Einträge (einheitlich)
│   └── web/
│       ├── server.js         # Express-Router, Auth (Session), Static
│       ├── auth.js           # Login-Logik (bcrypt, Rate-Limit, CSRF), Admin-Session
│       ├── settings.js       # GET/POST /api/settings, Cache-Invalidierung
│       ├── audit.js          # GET /api/audit (Admin-Session)
│       ├── views/            # EJS-Templates
│       │   ├── layout.ejs
│       │   ├── login.ejs
│       │   ├── dashboard.ejs     # Übersicht + Stats
│       │   ├── settings.ejs      # Einstellungen (zentrale Konfiguration)
│       │   ├── audit.ejs         # Audit-Log
│       │   ├── verification.ejs  # Verifizierte Mitglieder + Status
│       │   ├── tickets.ejs       # Offene/geschlossene Tickets
│       │   ├── ticket_detail.ejs # Transkript-Ansicht eines Tickets
│       │   └── applications.ejs  # Bewerbungen
│       └── public/
│           └── css/style.css     # Einheitliches Dashboard-Design
├── scripts/
│   ├── setup.js           # Seeded Default-Settings, Admin-Passwort-Hash, prüft Tokens/DB
│   └── migrate.js         # Wendet supabase/migrations/*.sql an
└── data/  (nur Transkripte, wird generiert)
```

---

## 3. Konfiguration

### 3.1 Grundprinzip (verbindlich)

- **`.env` enthält NUR Secrets und Basiswerte** (Discord-Token, Supabase-Zugang, Admin-Login).
- **Alle Rollen, Kanal-IDs und Modul-Optionen** werden in der Supabase-Tabelle **`settings`** (Key-Value) gespeichert und **über das Dashboard unter „Einstellungen"** verwaltet (`/dashboard/settings`). Der Code liest sie ausschließlich über `settingsService` (Kapitel 12).
- In den Kapiteln 5–10 genannte Namen (`COUNTING_CHANNEL_ID`, …) sind **Einstellungs-Keys** der `settings`-Tabelle, NICHT `.env`-Variablen.

### 3.2 `.env` (nur Secrets)

`.env.example` muss diese Variablen enthalten:

```env
# --- Discord (Pflicht) ---
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=

# --- Supabase (Pflicht) ---
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# --- Website ---
WEB_PORT=3000
WEB_URL=http://localhost:3000
DASHBOARD_USER=admin
DASHBOARD_PASSWORD_HASH=       # bcrypt-Hash des Passworts, wird bei npm run setup generiert (kein Klartext!)
```

### 3.3 Einstellungs-Keys (Tabelle `settings`, Standardwerte)

Diese werden beim `npm run setup` als Defaults eingefügt und sind **im Dashboard änderbar**:

| Key | Standard | Zweck |
|---|---|---|
| `staff_role` | `Staff` | Staff-Rolle (Name) |
| `admin_role` | `Admin` | Admin-Rolle (Name) |
| `warteraum_role` | `Warteraum` | Label-Rolle im Warteraum |
| `counting_channel_id` | *(leer)* | Zähl-Kanal |
| `counting_decimal` | `false` | Erlaubt Dezimalzahlen (`.`/`,`) |
| `ticket_category_id` | *(leer)* | Kategorie für Ticket-Kanäle |
| `ticket_panel_channel_id` | *(leer)* | Kanal mit Ticket-Panel |
| `ticket_log_channel_id` | *(leer)* | Kanal für Transkript-Log |
| `max_open_tickets` | `1` | Max. offene Tickets pro User |
| `application_category_id` | *(leer)* | Kategorie für Bewerbungs-Kanäle |
| `giveaway_channel_id` | *(leer)* | Kanal für Giveaway-Embeds |
| `giveaway_default_winners` | `1` | Standard-Gewinneranzahl |
| `giveaway_max_tickets` | `5` | Max. Lose pro Teilnehmer (Bonus-Lose) |
| `giveaway_required_roles` | *(leer)* | Pflicht-Rollen zur Teilnahme (JSON-Array von Rollen-IDs); leer = jeder |
| `giveaway_announce_channel_id` | *(leer)* | Kanal für Gewinner-Announcement (optional) |
| `warteraum_voice_channel_id` | *(leer)* | Voice-Kanal des Warteraums |
| `warteraum_target_channel_id` | *(leer)* | Voice-Kanal, in den versetzt wird |
| `verify_log_channel_id` | *(leer)* | Log-Kanal für Verifizierungen (optional) |
| `counting_target` | *(leer)* | Zielzahl; bei Erreichen automatischer Reset (leer = unendlich) |
| `counting_milestones_enabled` | `true` | Meilenstein-Embeds bei 100/500/1000/2500/5000/10.000 an |
| `counting_milestone_channel_id` | *(leer)* | Kanal für Meilenstein-Embeds (leer = Zähl-Kanal) |
| `application_cooldown_days` | `30` | Sperrfrist vor erneuter Bewerbung derselben Art (0 = aus) |
| `application_staff_ping` | `true` | Ping der Staff-Rolle bei neuer Bewerbung |
| `application_questions` | *(leer)* | Optionales JSON mit eigenen Fragen je Art (Key = Art) |
| `ticket_transcripts_enabled` | `true` | Transkript zusätzlich in der DB sichern (Dashboard-Ansicht) |

---

## 4. Datenbank (Supabase / PostgreSQL, Schema verbindlich)

Alle Tabellen in `public`. **RLS ist für diese Tabellen deaktiviert** (der Bot nutzt den Service-Role-Key als einziger Dienstzugang; falls RLS aktiviert werden soll, müssen entsprechende Policies für `service_role` angelegt werden). Migration: `supabase/migrations/001_init.sql`.

```sql
create table if not exists public.warteraum (
  discord_id text primary key,
  position integer not null,
  joined_at timestamptz default now()
);

create table if not exists public.users (
  discord_id text primary key,
  username text,
  verified_at timestamptz,
  left_at timestamptz
);

create table if not exists public.giveaways (
  id bigint generated always as identity primary key,
  guild_id text not null,
  message_id text,
  channel_id text,
  prize text not null,
  winners_count integer default 1,
  participant_count integer default 0,
  ticket_count integer default 0,
  marker text default '',            -- letzte Countdown-Markierung ('' | '2h' | '1h' | '15m' | '5m')
  warned boolean default false,      -- 5-Minuten-Warnung bereits gesendet
  ends_at timestamptz not null,
  ended boolean default false,
  host_id text,
  created_at timestamptz default now()
);

create table if not exists public.giveaway_participants (
  giveaway_id bigint not null references public.giveaways(id) on delete cascade,
  discord_id text not null,
  username text,
  tickets integer default 1,
  joined_at timestamptz default now(),
  primary key (giveaway_id, discord_id)
);

create table if not exists public.counting_stats (
  discord_id text primary key,
  count bigint default 0,
  wrong_counts bigint default 0
);

create table if not exists public.counting_state (
  id boolean primary key default true,
  current_number bigint default 0,
  last_user_id text,
  streak integer default 0,        -- aktuelle korrekte Serie
  best_streak integer default 0   -- Rekord-Serie
);

create table if not exists public.applications (
  id bigint generated always as identity primary key,
  discord_id text not null,
  type text not null,               -- z.B. 'Mod', 'Staff'
  answers jsonb not null,           -- JSON mit Antworten
  channel_id text,
  status text default 'offen',      -- offen | in_pruefung | angenommen | abgelehnt
  created_at timestamptz default now()
);

create table if not exists public.tickets (
  id bigint generated always as identity primary key,
  channel_id text unique,
  owner_id text not null,
  topic text,
  status text default 'offen',      -- offen | geschlossen
  claimed_by text,                  -- Discord-ID des bearbeitenden Staff (Claim)
  close_reason text,
  closed_by text,
  created_at timestamptz default now()
);

create table if not exists public.ticket_transcripts (
  id bigint generated always as identity primary key,
  ticket_id bigint references public.tickets(id) on delete cascade,
  content text not null,            -- Transkript als Klartext
  created_at timestamptz default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor text,                       -- Discord-Name oder Dashboard-User
  action text not null,             -- z.B. settings.update, giveaway.abort, counting.reset, login.fail
  detail jsonb,                     -- Kontext (geänderte Keys, Werte, IP)
  created_at timestamptz default now()
);

create table if not exists public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
```

**Hinweise:**
- Zeitstempel: PostgreSQL `timestamptz`, Vergleich/Anzeige in UTC bzw. lokaler Zeit.
- `answers`/`detail` als `jsonb` (nicht als Text).
- `settings`-Defaults siehe Kapitel 3.3 (`INSERT ... ON CONFLICT DO NOTHING` in der Migration).
- **Sicherer Datenzugriff (verbindlich):** Alle DB-Zugriffe ausschließlich über den `@supabase/supabase-js`-Query-Builder (parametrisiert). **Niemals** SQL-Strings durch String-Interpolation mit Nutzer- oder Formular-Eingaben bauen.
- **Audit-Pflicht:** `audit_log` wird bei allen sicherheitsrelevanten Aktionen beschrieben: Settings-Änderungen (welche Keys, vorher/nachher), Login-Erfolg/-Fehler, `counting reset`, `giveaway abbrechen/enden`, Ticket schließen, `/verify entfernen`.

---

## 5. Modul: Verifizierung (Button-Verifizierung, mehrstufig)

### Ablauf (verbindlich)

1. Der Admin postet das Panel mit `/verify panel` im Kanal `settings.verify_channel_id`. Alternativ wird das Panel beim Setup einmalig automatisch gepostet (Einrichtung, Kapitel 14).
2. Das Panel ist ein Embed mit Titel „**Verifizierung**", kurzer Beschreibung („Klicke auf ✅, um dich als Mitglied zu verifizieren") und einem Button **✅ Verifizieren**.
3. Klickt ein nicht verifiziertes Mitglied auf den Button:
   - **Stufe 1 (Regeln):** Ist `settings.verify_rules_channel_id` gesetzt und hat der Kanal mindestens eine Nachricht, zeigt der Bot die neueste Nachricht des Kanals (Inhalt oder Embed-Beschreibungen) als ephemerales Embed mit Button **✅ Regeln akzeptieren**. Der Button ist nur 60 Sekunden gültig und nur für den startenden Nutzer ausführbar. Fehlt der Kanal oder ist er leer, wird diese Stufe übersprungen (mit Log-Warnung bei unlesbarem Kanal).
   - **Stufe 2 (Alter-Check):** `settings.verify_min_account_age_days` > 0 und Account jünger → Blockierung mit Fehler-Embed, `verify.rejected_age`-Audit und Log-Eintrag, keine Rolle.
   - **Stufe 3 (Rolle):** Der Bot vergibt `settings.verified_roles` an das Mitglied.
   - Optionaler DM-Ping („Du bist jetzt verifiziert. Willkommen!").
   - Eintrag in `users`-Tabelle: `discord_id`, `username`, `verified_at`.
   - Optionaler Log-Embed in `settings.verify_log_channel_id` (User, Zeitpunkt).
   - Antwort auf die Interaktion: kurzes Erfolgs-Embed.
4. Klickt ein **bereits verifiziertes** Mitglied erneut: Hinweis-Embed „Du bist bereits verifiziert." (kein Fehler), ohne Regeln-Schritt.
5. `guildMemberRemove` → `verified_role` wird nicht automatisch entfernt (Rolle bleibt beim Wiedereintritt), aber der `users`-Eintrag wird auf `left_at` gesetzt.
6. **Anti-Spam:** Klicks pro Kanal werden nicht limitiert (ein Button-Klick kostet nichts); es ist kein Code/kein externer Dienst beteiligt.

### Befehle

| Befehl | Berechtigung | Verhalten |
|---|---|---|
| `/verify panel` | Admin | Postet/aktualisiert das Verifizierungs-Panel im Kanal `settings.verify_channel_id` (ein Panel pro Kanal; erneuter Aufruf aktualisiert das bestehende) |
| `/verify status` | Jeder | Zeigt eigenen Verifizierungsstatus (verifiziert seit / nicht verifiziert) |
| `/verify entfernen <@user>` | Staff | Entfernt `verified_role` + setzt `left_at` im `users`-Eintrag (Nutzung z.B. bei Regelverstoß); schreibt `audit_log`-Eintrag |

### Fehlerfälle (verbindlich)

| Fall | Verhalten |
|---|---|
| `verify_channel_id` nicht gesetzt | `/verify panel` antwortet mit klarer Anleitung, kein Panel posten |
| `verify_rules_channel_id` gesetzt, aber Kanal nicht gefunden/unlesbar | Regeln-Stufe überspringen + Log-Warnung |
| Regeln-Nachricht leer (kein Inhalt, keine Embeds) | Regeln-Stufe überspringen |
| Regeln-Text länger als Embed-Limit | Auf 4000 Zeichen kürzen + Hinweis im Embed |
| `verify_accept_rules_<userId>` von fremdem Nutzer geklickt | Hinweis-Embed „Nicht für dich", kein Crash |
| Zeit abgelaufen (Button älter als 60s) | Fehler-Embed „Zeit abgelaufen", erneut auf Verifizieren klicken |
| `verified_role` nicht gefunden (ID gelöscht) | Button-Klick → Fehler-Embed + Log-Warnung, keine Rolle vergeben |
| Button-Interaktion fehlschlägt (Berechtigungen) | Log-Warnung + Embed-Hinweis an den Moderator-Kanal |
| Mitglied existiert nicht mehr im Server | Interaktion still ignorieren (kein Crash) |

### Settings

| Key | Default | Zweck |
|---|---|---|
| `verify_channel_id` | *(leer)* | Kanal, in dem das Panel gepostet wird |
| `verify_rules_channel_id` | *(leer)* | Kanal, dessen neueste Nachricht als Regeln-Stufe angezeigt wird (leer = Stufe übersprungen) |
| `verified_role` | *(leer)* | Rolle, die nach Klick vergeben wird |
| `verify_dm` | `true` | DM-Ping nach erfolgreicher Verifizierung |
| `verify_log_channel_id` | *(leer)* | Log-Kanal für Verifizierungs-Events (optional) |
| `verify_min_account_age_days` | `0` | Mindestalter des Discord-Accounts in Tagen (0 = deaktiviert) |

---

## 6. Modul: Warteraum (Voice-Queue)

### Verhalten (verbindlich)

1. `/warteraum hinzufügen <@user>` *(Staff)* → Benutzer wird in `warteraum`-Tabelle mit nächster freier Position eingereiht. Optional wird die Rolle `settings.warteraum_role` gesetzt und der Benutzer in den `settings.warteraum_voice_channel_id` verschoben (falls konfiguriert).
2. `/warteraum liste` → Embed mit aktueller Reihenfolge (Position, @Erwähnung, Wartezeit).
3. `/warteraum raus <@user>` *(Staff)* → Benutzer wird aus der Queue entfernt, in `settings.warteraum_target_channel_id` verschoben (falls konfiguriert), Rolle entfernt. Optionaler DM-Ping.
4. `/warteraum weiter` *(Staff)* → Nächster in der Queue wird aufgerufen: DM-Ping „Du bist dran" + Verschieben in Zielkanal. Aus Queue entfernt.
5. **Automatik:** Verlässt ein Benutzer den Voice-Warteraum, während er in der Queue steht, wird er **nicht** automatisch entfernt, aber mit `(abwesend)` in der Liste markiert. Kommt er zurück, verschwindet der Marker.
6. `guildMemberRemove` → Benutzer aus Queue + Warteraum-Rolle entfernen.

---

## 7. Modul: Giveaway

### Verhalten (verbindlich)

1. `/giveaway starten <preis> <dauer> [gewinner]` *(Staff)* — `dauer` z.B. `1h`, `2d`, `30m`; `gewinner` optional (Standard `settings.giveaway_default_winners`). Bot postet Embed in `settings.giveaway_channel_id` (oder im aktuellen Kanal, falls nicht konfiguriert):
   - Titel: „🎉 **GIVEAWAY**", Farbe je nach Restzeit (siehe Countdown-Markierungen)
   - Felder: Preis, Gewinneranzahl, Lose (Gesamt), Teilnehmeranzahl, Endzeit + Restzeit, Host
   - Footer: „Klicke auf den Button, um teilzunehmen"
   - Bot hängt einen **Teilnahme-Button** (`giveaway_join_<id>`) an.
   - Speicherung in `giveaways` (inkl. `participant_count = 0`, `ticket_count = 0`, `marker = ''`, `warned = false`). Liegt `ends_at` bereits in der Vergangenheit, startet das Giveaway mit +30 Minuten und gibt einen Hinweis.
2. **Teilnahme & Lose:** Mitglieder klicken auf den Teilnahme-Button. Jeder Klick erhöht das Los des Users um 1, **max. `settings.giveaway_max_tickets` (Default 5)** Lose pro User. Host und Bot werden nie als Teilnehmer gezählt.
   - Ist `settings.giveaway_required_roles` (JSON-Array von Rollen-IDs) gesetzt, müssen Teilnehmer eine dieser Rollen besitzen: Button-Klick von nicht berechtigten Usern wird abgelehnt (ephemer Fehler + DM-Hinweis), kein Zähler-Eintrag. Werden keine Rollen gefunden: Log-Warnung, Teilnahme ohne Rollen-Check zulassen.
   - Bei jedem Klick werden Zähler/Teilnehmerliste aktualisiert und das Embed aktualisiert (`participant_count` = distinct User, `ticket_count` = Summe der Lose).
   - Die Teilnehmerliste liegt in `giveaway_participants` mit Spalte `tickets` (Neustart-sicher).
3. **Auswertung:** Ein `setInterval` (alle 30 Sekunden) prüft Giveaways mit `ends_at <= jetzt` und `ended = false`. Zusätzlich prüft der Bot **beim Start** einmalig alle noch nicht abgeschlossenen Giveaways (Neustart-sicher).
   - Gewinner werden aus der gespeicherten Teilnehmerliste in `giveaway_participants` gezogen (gewichtete Ziehung: jedes Los = ein Eintrag im Pool, `Math.random`, **Host und Bot ausgeschlossen**; bei mehreren Gewinnern werden **unterschiedliche** Lose gezogen, Ziehen ohne Zurücklegen).
   - Embed wird zu „🏆 **GIVEAWAY BEENDET**" umgebaut (Preis, Gewinner als `@`-Erwähnung, Teilnehmeranzahl, Host); Button wird entfernt.
   - Gewinner erhalten **zusätzlich eine DM** („🎉 Herzlichen Glückwunsch! Du hast `<Preis>` gewonnen."), sofern deren DM-Einstellungen es erlauben (fehlgeschlagene DMs nur loggen, kein Fehler).
   - Optionales Announcement-Embed mit den Gewinnern in `settings.giveaway_announce_channel_id` (falls gesetzt).
4. **Countdown-Markierungen:** Das Lauf-Embed zeigt ab **2 h** Restzeit eine Markerzeile („⏰ Noch **2 Stunden**!", ab 1 h / 15 m entsprechend). Farbe: > 1 h violett, 15 m–1 h gelb, < 15 m rot. Bei Erreichen der **5-Minuten**-Grenze sendet der Bot zusätzlich eine Warnung im Giveaway-Kanal (einmalig, gesteuert über `marker`/`warned`).
5. **Keine Teilnehmer** → Embed „Keine Teilnehmer, Preis verfällt."
6. `/giveaway enden <giveaway-id>` *(Staff)* — beendet vorzeitig (gleiche Auswertung wie bei Zeitablauf).
7. `/giveaway verlängern <giveaway-id> <dauer>` *(Staff)* — verlängert `ends_at` und aktualisiert das Embed (neue Endzeit + Restzeit). Laufzeit-Check bleibt unberührt.
8. `/giveaway neu <giveaway-id>` *(Staff)* — zieht neu (falls Manipulation vermutet). Nur für **bereits beendete** Giveaways möglich; gleiche Ausschluss-Regeln, DM-Benachrichtigung an neue Gewinner.
9. `/giveaway teilnehmer <giveaway-id>` *(Staff)* — Embed mit Teilnehmeranzahl und Liste (bis zu 20 Namen mit Loszahl, danach „und X weitere"); funktioniert auch nach Ablauf.
10. `/giveaway abbrechen <giveaway-id>` *(Staff)* — bricht das Giveaway ab: Embed-Nachricht wird gelöscht (falls noch vorhanden), `ended = true`, kein Gewinner, Log-Eintrag.
11. `/giveaway liste` *(Staff)* — zeigt laufende Giveaways (ID, Preis, Endzeit, Lose, Teilnehmeranzahl).
12. **Sprache:** Alle Bot-Nachrichten (Embeds, Buttons, DMs) folgen der Server-Sprache (`settings.language`), Fallback Deutsch.

### Befehle (Übersicht)

| Befehl | Berechtigung | Verhalten |
|---|---|---|
| `/giveaway starten` | Staff | Startet Giveaway (siehe 1) |
| `/giveaway enden` | Staff | Beendet vorzeitig |
| `/giveaway verlängern` | Staff | Verlängert die Endzeit |
| `/giveaway neu` | Staff | Zieht neu (nur beendete) |
| `/giveaway teilnehmer` | Staff | Zeigt Teilnehmerliste |
| `/giveaway abbrechen` | Staff | Bricht ab, löscht Embed |
| `/giveaway liste` | Staff | Zeigt laufende Giveaways |

### Fehlerfälle (verbindlich)

| Fall | Verhalten |
|---|---|
| `giveaway_channel_id` nicht gesetzt | `/giveaway starten` postet ins aktuellen Kanal (kein Fehler) |
| `giveaway_required_roles` nicht gefunden | Log-Warnung; Teilnahme ohne Rollen-Check zulassen |
| Teilnehmer erreicht `giveaway_max_tickets` | Ephemer Fehler „Maximale Lose erreicht", kein weiterer Eintrag |
| Giveaway-ID nicht gefunden | Fehler-Embed mit Hinweis + Verweis auf `/giveaway liste` |
| Gewinner-DM nicht möglich | Nur loggen, Embed-Erwähnung bleibt |
| Bot-Neustart während laufendem Giveaway | Ablauf-Check beim Start fängt abgelaufene Giveaways (siehe 3) |

### Settings

| Key | Default | Zweck |
|---|---|---|
| `giveaway_channel_id` | *(leer)* | Kanal für Giveaway-Embeds |
| `giveaway_default_winners` | `1` | Standard-Gewinneranzahl |
| `giveaway_max_tickets` | `5` | Max. Lose pro Teilnehmer (Bonus-Lose) |
| `giveaway_required_roles` | *(leer)* | Pflicht-Rollen zur Teilnahme (JSON-Array von Rollen-IDs); leer = jeder |
| `giveaway_announce_channel_id` | *(leer)* | Kanal für Gewinner-Announcement (optional) |

---

## 8. Modul: Counting (Zähl-Kanal)

### Verhalten (verbindlich)

1. Im Kanal `settings.counting_channel_id` zählen Mitglieder **nur Zahlen** in aufsteigender Reihenfolge (1, 2, 3, …).
2. Regeln:
   - Nur ein Kanal, nur Zahlen (eine Zahl pro Nachricht). Dezimalzahlen nur, wenn `settings.counting_decimal = true` (Standard: nur Ganzzahlen).
   - Ein Benutzer darf **nicht zweimal hintereinander** zählen.
   - Falsche Zahl, doppeltes Zählen oder Nicht-Zahl → **Countdown-Reset auf 0**, `streak` wird zurückgesetzt, `wrong_counts` des Benutzers wird erhöht; Bot postet: „❌ `{User}` hat `{Wert}` gesagt — der Zähler ist zurück auf 0."
   - Richtige Zahl → kein Bot-Spam; optional reagiert der Bot mit ✔ (React).
3. Der aktuelle Zählerstand wird in `counting_state` persistiert (Neustart-sicher), inkl. `streak` und `best_streak` (Rekord-Serie). Bei jedem korrekten Beitrag: `streak` +1 und bei Überschreitung `best_streak` aktualisieren.
4. **Zielzahl:** Ist `settings.counting_target` gesetzt (z.B. `1000`) und die Zahl erreicht, postet der Bot ein Erfolgs-Embed („🎉 Ziel `X` erreicht!") und setzt den Zähler zurück auf 0 (Neustart des Counts). Bei einem Fehler wird zusätzlich gepostet, wie weit es bis zum Ziel war.
5. **Meilensteine:** Wenn `settings.counting_milestones_enabled = true`, postet der Bot bei den Schwellen 100, 500, 1000, 2500, 5000 und 10.000 (sowie jedem weiteren Vielfachen von 10.000) ein Meilenstein-Embed („🎯 `X` erreicht!") in `settings.counting_milestone_channel_id` (leer = Zähl-Kanal). Pro Schwelle nur einmal.
6. `/counting leaderboard` — Top 10 nach `counting_stats.count`.
7. `/counting stats [@user]` — eigener oder gewählter User: korrekte Beiträge, falsche Beiträge, aktuelle Serie, Rekord-Serie.
8. `/counting set <zahl>` *(Admin)* — setzt den Zählerstand manuell (z.B. nach Fehlbedienung); schreibt `audit_log`.
9. `/counting ziel set <zahl>` / `/counting ziel aus` *(Admin)* — setzt/entfernt die Zielzahl (`counting_target`), schreibt `audit_log`.
10. `/counting reset` *(Admin)* — setzt Zähler zurück, schreibt `audit_log`.
11. Jeder korrekte Beitrag erhöht `counting_stats` des Benutzers.

### Settings

| Key | Default | Zweck |
|---|---|---|
| `counting_channel_id` | *(leer)* | Zähl-Kanal |
| `counting_decimal` | `false` | Erlaubt Dezimalzahlen (`.`/`,`) |
| `counting_target` | *(leer)* | Zielzahl; bei Erreichen automatischer Reset (leer = unendlich) |
| `counting_milestones_enabled` | `true` | Meilenstein-Embeds an |
| `counting_milestone_channel_id` | *(leer)* | Kanal für Meilensteine (leer = Zähl-Kanal) |

---

## 9. Modul: Bewerbung (Application)

### Verhalten (verbindlich)

1. `/bewerbung <art>` — `art` z.B. `Mod`, `Supporter`, `Eventteam`. Startet einen **DM-Fragenflow**: Der Bot schickt dem User eine Privatnachricht und stellt die Fragen **nacheinander** (je Art 4–6 Fragen, z.B. „Wie alt bist du?", „Warum willst du Moderator werden?", „Wie viel Zeit hast du täglich?").
   - **Eigene Fragen:** Liegt in `settings.application_questions` ein JSON-Objekt vor (z.B. `{ "Mod": ["Frage 1", "Frage 2", …] }`), werden die Standardfragen für diese Art durch die dortigen Fragen ersetzt.
2. **DM-Ablauf:** Der User antwortet per DM auf jede Frage. Nach jeder Antwort sendet der Bot die nächste Frage. Das Wort `abbrechen` bricht den Flow ab. Nach der letzten Antwort wird die Bewerbung gespeichert.
3. **Cooldown:** Ein User kann sich pro Art nur einmal innerhalb von `settings.application_cooldown_days` (Standard 30) erneut bewerben. Bei Verstoß: Hinweis-Embed mit Restzeit, kein DM-Flow wird gestartet.
4. Nach Abschluss des DM-Flows wird in `settings.application_category_id` ein privater Kanal pro Bewerbung erstellt (Name: `bewerbung-<art>-<kurzid>`), nur der Bewerber + Staff sehen ihn.
5. Der Bot postet ein **Review-Embed** mit allen Antworten (eine Zeile/Feld je Frage) + drei Buttons: **👍 Annehmen**, **👎 Ablehnen** und **🎤 Interview starten** *(nur Staff)*. Embed-Farbe: offen = Info-Blau, angenommen = Grün, abgelehnt = Rot; Footer mit Server-Name + Timestamp.
6. Ist `settings.application_staff_ping = true`, pingt der Bot zusätzlich die Staff-Rolle (`settings.staff_role`) als neue-Bewerbung-Benachrichtigung (einmalig, nur im Kanal).
7. Button „Annehmen" → Embed wird grün/„Angenommen", Status in DB, **`settings.application_role_id` wird dem Bewerber vergeben** (falls konfiguriert), Bewerber-DM mit Glückwunsch, Kanal bleibt als Archiv. Danach zeigt das Embed nur noch den Button „🎤 Interview starten".
8. Button „Ablehnen" → Embed rot/„Abgelehnt", Bewerber-DM (sachlich), Kanal archiviert, alle Buttons entfernt.
9. Button „🎤 Interview starten" *(nur Staff, nur bei Status `angenommen`)* → startet ein **Interview** für den Bewerber (siehe Kapitel 10, `eghr_interviews`), verknüpft über `eghr_interviews.application_id` mit der Bewerbung. Das Interview wird im konfigurierten Interview-Kanal (`interview_channel_id`) bzw. im aktuellen Kanal gestartet. Nach bestandenem Interview kann Staff den Bewerber im Dashboard über „Ins Team aufnehmen" als Teammitglied übernehmen; dabei werden `application_id` und `interview_id` im Teammitglied gespeichert (Kette Bewerbung → Interview → Team).
10. `/bewerbung schließen <channel-id>` *(Staff)* — schließt/archiviert manuell (schreibt `audit_log`).
11. `/bewerbung liste` — Übersicht offener Bewerbungen.

### Settings

| Key | Default | Zweck |
|---|---|---|
| `application_category_id` | *(leer)* | Kategorie für Bewerbungs-Kanäle |
| `application_cooldown_days` | `30` | Sperrfrist vor erneuter Bewerbung derselben Art (0 = aus) |
| `application_staff_ping` | `true` | Ping der Staff-Rolle bei neuer Bewerbung |
| `application_questions` | *(leer)* | Optionales JSON mit eigenen Fragen je Art (Key = Art) |
| `application_role_id` | *(leer)* | Rolle, die der Bewerber bei Annahme erhält |

---

## 10. Modul: Interview

### Ablauf (verbindlich)

1. **Start:** Staff startet mit `/interview starten <@user> [kanal]` (oder aus einer Bewerbung mit Status `angenommen` via Button „Interview starten") ein Interview für einen Bewerber. Standardkanal: `settings.interview_channel_id`, sonst der aktuelle Kanal. Fragen stammen aus `eghr_interview_questions`; fehlen welche, werden die Default-Fragen angelegt (30 Fragen, `max_points: 2`, Abschnitte 1–3).
2. **Bewertung:** Der Bot postet die Fragen in Blöcken à 5 (eine Nachricht je Block) mit Score-Buttons (`0 / 0,5 / 1 / 1,5 / 2`, begrenzt auf `max_points` der Frage). Staff bewertet per Klick; die Embed-Nachrichten werden live aktualisiert. Bewertungen sind jederzeit änderbar.
3. **Abschluss:** Sobald alle Fragen bewertet sind, ist das Interview `fertig`. Bestehens-Entscheidung: `pct = total / maxTotal * 100`, **bestanden** wenn `pct >= settings.interview_pass_threshold` (Prozent, Default `75`). `passed` wird erst bei vollständiger Bewertung gesetzt (nicht bei Teilbewertung).
4. **Ergebnis-Embed:** In den Interview-Kanal postet der Bot ein Ergebnis-Embed: 🎉 bestanden (grün) / ❌ nicht bestanden (rot) mit erreichten Punkten, Prozent und „Bestanden ab **X %** (Y Punkte)".
5. **Ergebnis-DM:** Der Bewerber erhält parallel eine DM mit demselben Ergebnis (Punkte, Prozent, Bestehensgrenze). DM geschlossen → nur Log-Warnung, kein Crash.
6. **Bewertungsbogen-Import:** Alternativ kann Staff einen Bewertungsbogen im Dashboard (Interview → „Bewertungsbogen einfügen", Format `1. Frage \`1,5/2P\``) importieren. Der Import übernimmt Punkte je Frage, berechnet Gesamtpunktzahl, Bestehens-Entscheidung (identische Prozentlogik) und versendet bei `complete` ebenfalls Ergebnis-Embed + DM.
7. **Team-Aufnahme:** Nach bestandenem Interview kann Staff den Bewerber im Dashboard über „Ins Team aufnehmen" als Teammitglied übernehmen; dabei werden `application_id` und `interview_id` im Teammitglied gespeichert (Kette Bewerbung → Interview → Team).

### Settings

| Key | Default | Zweck |
|---|---|---|
| `interview_channel_id` | *(leer)* | Standard-Kanal für Interviews |
| `interview_pass_threshold` | `75` | Bestehens-Schwelle in **Prozent** der Maximalpunktzahl |

### Fehlerfälle

| Fall | Verhalten |
|---|---|
| Keine Fragen hinterlegt | Fehler-Embed, kein Interview-Start |
| `interview_pass_threshold` fehlt/ungültig | Fallback `75` |
| DM an Bewerber geschlossen | Log-Warnung, Interview-Ergebnis bleibt im Kanal sichtbar |
| Ergebnis-Embed nicht sendbar (Kanal gelöscht) | Log-Warnung, DM wird trotzdem versucht |

---

## 11. Modul: Ticket-Support

### Verhalten (verbindlich)

1. In `settings.ticket_panel_channel_id` postet der Bot (einmalig via `/ticket panel` *(Staff)*) ein Panel-Embed: „**Support-Ticket** — Klicke 🎫 um ein Ticket zu öffnen". Sind **Ticket-Typen** konfiguriert (Dashboard → Tickets → Ticket-Typen), zeigt das Panel einen **Dropdown** (String-Select) „Ticket öffnen" mit allen Typen; ohne Typen bleibt der Button **🎫 Ticket öffnen** (Fallback).
2. Ticket-Öffnung → privater Kanal in der **Kategorie des Typs** (`ticket_category_id` als Fallback ohne Typen). Name: `ticket-<user>` (Fallback) bzw. `ticket-<typ>-<user>`. Berechtigungen: Bot + Nutzer (view+send), Staff-Rollen (view+send), @everyone (nichts). Mehrere Tickets pro User: max. `settings.max_open_tickets` (Standard 1) gleichzeitig offen, **bei Typen das eigene `max_open` des Typs** (blockiert nur weitere Tickets desselben Typs), sonst Hinweis-Embed.
3. Ticket-Kanal-Inhalt: kurzes Willkommens-Embed (nennt bei Typen den Typ, z. B. „🎫 Support") + Button **🔒 Ticket schließen**. Ist bei einem Typ eine **Ping-Rolle** gesetzt, pingt der Bot die Rolle einmalig im neuen Kanal. Ist das Ticket geclaimt, zeigt ein Feld den zuständigen Staff (`🧑‍✈️ Zuständig: @user`).
4. **Claim:** `/ticket claim` *(Staff)* — übernimmt das Ticket (setzt `claimed_by`, Embed-Update, optional DM an den Owner „Dein Ticket wird von @user bearbeitet"). `/ticket unclaim` *(Staff)* — gibt das Ticket frei. Ein Ticket kann nur von **einem** Staff gleichzeitig geclaimt sein.
5. „Ticket schließen" → Fragt per Modal nach Grund (optional). Danach:
   - Transkript als Textdatei in `data/transcripts/ticket-<id>-<timestamp>.txt` speichern.
   - Bei `settings.ticket_transcripts_enabled = true`: Transkript zusätzlich in `ticket_transcripts` sichern → auf `/dashboard/tickets/<id>` ansehbar (nur Admin-Session).
   - `close_reason` und `closed_by` in der `tickets`-Zeile speichern.
   - Embed mit Grund + Transkript-Pfad in `settings.ticket_log_channel_id` posten (falls konfiguriert).
   - Kanal nach 10 Sekunden löschen.
   - `audit_log`-Eintrag.
6. `/ticket hinzufügen <@user>` *(Staff)* — fügt Benutzer zu Ticket-Kanal hinzu.
7. `/ticket schließen` *(Staff)* — schließt ohne Modal sofort (Grund „von Staff geschlossen", `audit_log`-Eintrag).

### Settings

| Key | Default | Zweck |
|---|---|---|
| `ticket_category_id` | *(leer)* | Fallback-Kategorie für Ticket-Kanäle (gilt nur ohne Ticket-Typen) |
| `ticket_panel_channel_id` | *(leer)* | Kanal mit Ticket-Panel |
| `ticket_log_channel_id` | *(leer)* | Kanal für Transkript-Log |
| `max_open_tickets` | `1` | Max. offene Tickets pro User (Fallback ohne Ticket-Typen) |
| `ticket_transcripts_enabled` | `true` | Transkript zusätzlich in der DB sichern |

### Ticket-Typen

Konfigurierbar im Dashboard (Tickets → Ticket-Typen), Tabelle `eghr_ticket_types`:

| Feld | Zweck |
|---|---|
| `name` | Anzeigename, z. B. „Support" |
| `emoji` | Emoji des Typs (Standard 🎫) |
| `category_id` | Eigene Kategorie für Ticket-Kanäle dieses Typs |
| `max_open` | Max. gleichzeitig offene Tickets pro User für diesen Typ |
| `ping_role_id` | Optionale Rolle, die bei neuen Tickets des Typs gepinnt wird |
| `sort` | Reihenfolge im Panel-Dropdown |

Ein offenes Ticket speichert `type_id` (FK auf `eghr_ticket_types`, `on delete set null`). Ohne konfigurierte Typen gilt das Fallback-Verhalten aus `ticket_category_id`/`max_open_tickets` unverändert.

---

## 12. Website-Dashboard

### 11.1 Allgemein

- Läuft im selben Express-Prozess auf `WEB_PORT`.
- **Login:** `/dashboard/login` mit `DASHBOARD_USER` + Passwort-Hash `DASHBOARD_PASSWORD_HASH` (aus `.env`, Vergleich mit `bcryptjs`).
  - **Brute-Force-Schutz:** max. 5 Fehlversuche pro 15 Minuten pro IP (`express-rate-limit`) → danach 15 Minuten Lockout (Statusmeldung im Login-Formular). Jeder Fehlversuch schreibt einen `audit_log`-Eintrag (`login.fail`).
  - **Session:** `express-session` mit `httpOnly`, `SameSite=Strict`, `Secure`-Flag wenn über HTTPS geliefert (in Produktion Pflicht), Ablauf nach 24h absolut + 30 min Inaktivität (`rolling`). Session-ID wird **nach erfolgreichem Login neu erzeugt** (keine Fixation). Session-Store: In-Memory (bei Neustart neu einloggen). Es werden **keine Secrets in der Session** gespeichert.
  - **CSRF-Schutz:** Alle POST-Endpunkte (`/api/settings`, Login) prüfen den `Origin`/`Referer`-Header (erlaubte Domains: `WEB_URL` + Host-Header) und ein CSRF-Token (pro Session, in Formular versteckt) — sonst `403`.
- **Security-Header:** `helmet` (CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `X-Powered-By` deaktiviert). **Kein CORS** für API-Endpunkte (Same-Origin). Bei DB-Ausfällen: Seiten rendern trotzdem mit Fehlermeldung, kein Absturz.
- **Design:** Dunkles, modernes Dashboard. Einheitliche Farben passend zur Community (dunkelblau/schwarz mit roten Akzenten). Eigenständiges CSS ohne Framework-Abhängigkeit (plain CSS, eine `style.css`).
- Seiten sind **serverseitig gerendert** (EJS). **Alle Nutzer-/DB-Werte werden escaped** (Standard `<%= %>`; kein `<%- %>` für unkontrollierte Daten).
- **Zentrale Einstellungsverwaltung:** Die Seite „Einstellungen" ist die primäre Konfigurationsoberfläche (Kapitel 3.3). Alle Änderungen werden in `settings` gespeichert und **sofort wirksam** (Cache-Invalidierung). **Jede Änderung schreibt einen `audit_log`-Eintrag** (welche Keys, vorher → nachher). Nur Secrets (Token, Keys, Admin-Login) bleiben in `.env`.

### 11.2 Seiten

| Route | Inhalt |
|---|---|
| `/` | Weiterleitung → `/dashboard` |
| `/dashboard/login` | Login-Formular (mit Lockout-/Fehlermeldung) |
| `/dashboard` | Kachel-Übersicht: offene Tickets, offene Bewerbungen, laufende Giveaways, Zählerstand, Link zu allen Unterseiten |
| `/dashboard/settings` | **Einstellungen** — Formular gruppiert nach Modul: Rollen, Kanäle, Warteraum, Counting, Giveaway, Tickets, Bewerbung. Speichern per POST → sofort wirksam + Audit-Eintrag. |
| `/dashboard/audit` | **Audit-Log** — letzte 200 Einträge (Zeit, Akteur, Aktion, Details), filterbar nach Aktion |
| `/dashboard/tickets` | Offene + geschlossene Tickets (Status, Owner, Claimed-by, Grund, Kanal-Link, Zeit) |
| `/dashboard/tickets/<id>` | **Transkript-Ansicht** eines geschlossenen Tickets (nur wenn `ticket_transcripts_enabled`) |
| `/dashboard/applications` | Bewerbungen mit Status, Auswertung der Antworten (JSON formatiert), Zeit |
| `/api/settings` | `GET`: alle Einstellungen (JSON, nur Admin-Session) |
| `/api/settings` | `POST`: speichert Einstellungen (nur Admin-Session, CSRF-Pflicht), invalidiert `settingsService`-Cache, schreibt Audit-Eintrag |
| `/api/audit` | `GET`: Audit-Log (JSON, nur Admin-Session) |

### 11.3 Datenquellen

- Alle Daten aus der **Supabase-Datenbank** (Kapitel 4). Keine Live-Discord-API-Abfragen für die Listen (Performance).
- Bot-Online-Status optional: `/api/status` liefert `{ "bot": "online"|"offline", "guilds": N, "uptime": s }`.

---

## 13. Embed-Design (einheitlich, alle Module nutzen es)

**Zentrale Builder in `embeds.js`, alle Module nutzen sie.**

### Farben

| Verwendung | Hex |
|---|---|
| Standard/Info | `#2B3A67` (dunkelblau) |
| Erfolg/Annehmen | `#2ECC71` (grün) |
| Fehler/Sperrung | `#E74C3C` (rot) |
| Warnung | `#F1C40F` (gelb) |
| Giveaway | `#9B59B6` (lila) |
| Warteraum | `#3498DB` (blau) |

### Gemeinsame Elemente
- **Footer:** `🏥 Notruf Hamburg • <Server-Name>` + Footer-Timestamp.
- **Emoji vor Titeln:** je Modul (siehe Kapitel).
- **Alle Texte auf Deutsch**, korrekte Grammatik.
- **Zahlen** im deutschen Format (`1.234`).
- Max. 3 Felder pro Embed; lange Werte kürzen (`…` + „(+N weitere)").

### Beispiele (wörtlich umzusetzen)

**Giveaway (läuft):**
```
🎉 GIVEAWAY
Preis: <Preis>
Gewinner: 1
Lose: 5
Teilnehmer: 12
Endet: <Zeit> (<Restzeit>)
Host: <@host>

🚨 Noch **5 Minuten**!
```
[🎉 Teilnehmen]

**Giveaway (beendet):**
```
🏆 GIVEAWAY BEENDET
Preis: <Preis>
Gewinner: @Gewinner1, @Gewinner2
Teilnehmer: 12
Host: <@host>
```

**Warteraum-Liste:**
```
🎧 Warteraum — Warteschlange
1. @User1 — wartet seit 5 Min.
2. @User2 — wartet seit 12 Min.
3. @User3 (abwesend) — wartet seit 20 Min.
```

---

## 14. Einrichtung, Fehlerbehandlung, Sicherheit

### 13.1 Einrichtung (Schritt für Schritt)

1. `npm install`
2. `.env.example` → `.env` kopieren und **Secrets** eintragen: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Supabase-Projekt anlegen (oder lokal via `supabase start`), dann `npm run migrate` — wendet `supabase/migrations/001_init.sql` an (Tabellen + Default-Settings).
4. `npm run setup` — prüft DB-Verbindung, seett `settings`-Defaults (falls fehlend), generiert ein Zufallspasswort und schreibt dessen **bcrypt-Hash** in `DASHBOARD_PASSWORD_HASH` (zeigt das Passwort **einmalig** an), prüft Bot-Token (Login).
5. `npm run deploy` — registriert alle Slash-Kommandos.
6. `npm start` — Bot + Web-Server laufen.
7. **Dashboard öffnen** (`WEB_URL/dashboard`), einloggen, unter **„Einstellungen"** Rollen und Kanal-IDs eintragen → Speichern (sofort wirksam).
8. `/ticket panel` im konfigurierten Panel-Kanal — Panel posten.
9. `/giveaway` testen.

### 13.2 Fehlerbehandlung (verbindlich)

- **Silent-Fail:** Alle Discord-API- und DB-Fehler werden geloggt, nie den Prozess crashen lassen. `process.on('unhandledRejection'/'uncaughtException')` → loggen + weiterlaufen.
- **Rate-Limits:** discord.js handhabt das nativ.
- **Supabase/DB:** `@supabase/supabase-js` nutzt HTTP — **transiente Fehler mit Retry** (max. 2 Versuche, Backoff 500 ms). Verbindungsprobleme loggen (max. 1× pro Fehlertyp pro Stunde) und weiterlaufen. Kein lokaler DB-Zwang; bei Ausfall zeigt das Dashboard eine Fehlermeldung statt eines Crashes.
- **Express:** Zentraler Error-Handler. Antworten enthalten **nie** Stack-Traces oder interne Pfade (im Log, nicht im Response). Nicht erkannte Routen → `404`.
- **Logs:** `logs/app.log` (winston, rotation auf 5 MB). Level INFO; Debug bei `DEBUG=1`.

### 13.3 Sicherheit (verbindlich)

- **Niemals** Token/Passwörter/Keys in Logs oder Embeds ausgeben.
- `SUPABASE_SERVICE_ROLE_KEY` **nur serverseitig** verwenden, niemals an den Browser ausliefern. Dashboard-API-Endpunkte prüfen die Admin-Session serverseitig.
- Dashboard-Passwort wird **gehasht** (`bcryptjs`) in `DASHBOARD_PASSWORD_HASH` gespeichert, nie im Klartext (weder `.env` noch Logs noch Konsole — Klartext nur einmalig bei `npm run setup`).
- **Web-Angriffsfläche:**
  - `helmet`-Header (CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`), kein CORS, `X-Powered-By` aus.
  - Login-Rate-Limit + Lockout (5 Fehlversuche/15 min/IP), Session-Fixation-Schutz (neue Session-ID nach Login).
  - CSRF-Schutz auf allen POST-Endpunkten (Origin-Check + Token).
  - Alle Nutzerdaten im EJS escaped; keine Roh-HTML-Ausgabe unkontrollierter Daten.
  - Body-Größen-Limit für JSON-Requests (Express).
  - Audit-Log für alle sicherheitsrelevanten Aktionen (Login, Settings, Reset, Abort).
- Discord-Bot: nur minimal nötige Permissions (ViewChannel, SendMessages, EmbedLinks, ManageMessages, ManageChannels, MoveMembers, ManageRoles, AddReactions, ReadMessageHistory).
- `.env` und `data/` sind gitignored.
- Interaktions-Befehle prüfen Rollen (`settings.staff_role`/`settings.admin_role`) **serverseitig**, nicht nur im UI.
- **DB-Zugriff:** ausschließlich parametrisierte Queries über `@supabase/supabase-js`; keine String-Interpolation von Nutzer-/Formular-Daten in SQL.
- **Transkripte** enthalten private Gespräche: Zugriff nur über Admin-Session, Dateien bleiben in `data/` (gitignored), `ticket_transcripts` nur intern auswerten.

---

## 15. Modul: Willkommen (Willkommensnachricht)

### Ablauf (verbindlich)

1. Tritt ein Mitglied dem Server bei (`guildMemberAdd`), lädt der Bot die Konfiguration aus `eghr_welcome_messages`.
2. Ist das Modul nicht aktiv oder kein Kanal gesetzt, passiert nichts.
3. Sonst wird ein Willkommens-Embed im Kanal `settings.channel_id` gesendet:
   - **Titel**, **Beschreibung**, **Farbe**, **Bild-URL**, **Thumbnail-URL** aus `embed_data` (Platzhalter gerendert).
   - **Felder** aus `embed_data.fields` (Array `{ name, value, inline }`), Platzhalter gerendert; max. 25 Felder, leere Felder übersprungen.
4. Ist `dm_enabled` gesetzt, erhält das Mitglied dieselbe Nachricht als DM.
5. Ist `auto_role_ids` gesetzt, werden diese Rollen vergeben.

### Platzhalter

| Platzhalter | Ergebnis |
|---|---|
| `{user}` | Ping `<@id>` |
| `{username}` | Reiner Nutzername |
| `{server}` | Servername |
| `{member_count}` | Server-Mitgliederzahl |
| `{join_date}` | Beitrittsdatum des Mitglieds (`DD.MM.YYYY`, Fallback: heute) |
| `{user_count}` | Anzahl Nicht-Bot-Mitglieder |
| `{bot_count}` | Anzahl Bot-Mitglieder |

- Unbekannte Platzhalter bleiben unangetastet (kein Fehler).

### Fehlerfälle (verbindlich)

| Fall | Verhalten |
|---|---|
| Kein Kanal / Modul deaktiviert | Nichts tun |
| Kanal nicht gefunden / nicht textbasiert | Still überspringen |
| `fields` kein Array | Ignorieren |
| Feld mit leerem Name oder Wert | Überspringen |
| Mehr als 25 Felder | Nach 25 stoppen + Log-Warnung |
| DM nicht sendbar (DMs geschlossen) | Still überspringen |
| Auto-Rollen nicht findbar | Still überspringen |

---

## 16. Abnahmekriterien (Definition of Done)

Der Bot gilt als fertig, wenn alle Punkte erfüllt sind:

- [ ] Bot startet mit `npm start`, loggt „Bot online" und „HTTP-Server läuft".
- [ ] `npm run migrate` + `npm run setup` + `npm run deploy` funktionieren ohne Fehler; alle Tabellen in Supabase existieren.
- [ ] Dashboard: Login funktioniert (mit bcrypt-Hash + Lockout); unter **Einstellungen** sind Rollen und Kanal-IDs änderbar und werden **sofort** wirksam (kein `.env`-Edit nötig); jede Änderung erscheint im Audit-Log.
- [ ] Warteraum-Queue: Hinzufügen, Liste, Weiter, Raus funktionieren; Voice-Verschiebung funktioniert.
- [ ] Giveaway: Start, Teilnahme (optional mit Rollen-Pflicht), Zeitablauf, Gewinner-Ziehung (Host/Bot ausgeschlossen, ohne Zurücklegen), Gewinner-DM, Verlängern, Teilnehmerliste, Neu-Ziehung, Abbrechen; Neustart-sicher.
- [ ] Counting: korrektes Zählen, Reset bei Fehler (mit `wrong_counts` + `streak`), Meilensteine, Zielzahl, `set`, Leaderboard, Neustart-sicher.
- [ ] Bewerbung: Modal öffnet (ggf. eigene Fragen), Cooldown greift, Kanal wird erstellt, Staff-Ping, Annehmen/Ablehnen funktioniert.
- [ ] Ticket: Panel-Button öffnet Kanal, Claim/Unclaim, Transkript (Datei + DB), Schließen löscht Kanal.
- [ ] Alle Seiten + `/api/settings` + `/api/audit` laden; Daten kommen aus Supabase.
- [ ] Alle Embeds folgen dem Design in Kapitel 13 (Farben, Footer, Deutsch).
- [ ] Keine Token/Geheimnisse in Logs oder Repo; Service-Role-Key nie im Client; Dashboard-Passwort nur als Hash.
- [ ] Audit-Log wird bei Settings-Änderungen, Login und Resets geschrieben.

---

## 17. Hinweise an die ausführende KI

1. **Vollständigkeit:** Alle Module in Kapitel 5–11 umsetzen. Kein Modul weglassen.
2. **Dateistruktur:** Genau der Struktur in Kapitel 2 folgen. Jede Datei klar benennen.
3. **Kommentare:** Kurze, deutsche Kommentare nur wo nicht offensichtlich.
4. **Code-Stil:** Modernes, sauberes JavaScript (ES2022, CommonJS), `async/await`, try/catch um alle I/O-Operationen.
5. **Konfiguration:** Nur die Secrets aus Kapitel 3.2 müssen in `.env` stehen; **alle** Rollen/Kanäle/Moduleinstellungen liest der Code über `settingsService` aus der Supabase-`settings`-Tabelle (Kapitel 3.3). Der Code darf ohne gesetzte Pflichtsecrets nicht crashen (Warnung + Weiterlauf), Ausnahme: `DISCORD_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` → sauberer Abbruch mit Anleitung.
6. **Testbarkeit:** Befehle sollen ohne echte Events testbar sein (`scripts/setup.js`).
7. **Sicherheit zuerst:** Security-Vorgaben aus Kapitel 14.3 sind verbindlich (bcrypt, Rate-Limit, CSRF, parametrisierte Queries, EJS-Escaping, Audit-Log). Fehlende Vorgaben nicht „einfach so" weglassen.
8. **Diese Datei ist die einzige Referenz.** Bei scheinbarem Widerspruch: diese Datei gewinnt.

---
*Ende des Masterprompts.*
