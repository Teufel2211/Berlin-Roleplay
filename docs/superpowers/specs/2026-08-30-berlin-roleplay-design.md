# Berlin Roleplay — System-Design-Spec

> Datum: 2026-08-30 · Status: genehmigt (User-Freigabe für alle Abschnitte erteilt)
> Ersetzt die bisherige Spec `2026-08-29-welcome-verification-design.md` und `MASTERPROMPT.md` (Alt-System Emergency Hamburg Roleplay wird abgelöst).

---

## 1. Zielbild

**Berlin Roleplay** ist ein komplett neues Discord-Bot-System mit professioneller Landingpage und vollständiger ERLC-Funktion. Es ersetzt das bestehende Projekt **Emergency Hamburg Roleplay** vollständig.

- Neuer Stack, neue Codebasis, neue Tabellen-**Alles-Neu** (keine Daten-Migration).
- **Harte Regel:** ausschließlich **Discord Components V2** — keine klassischen Embeds, kein `EmbedBuilder`, kein `content`-Feld, keine Embeds in API-Payloads. Alle Bot-Nachrichten bestehen aus Text-Displays, Sections, Containern, MediaGalleries, Separators, Buttons und Selects (`flags: MessageFlags.IsComponentsV2`).
- Bot-Identität bleibt: bestehender Discord-Bot (gleicher Token, gleiche Invite, gleiche Guilds). Server `1511027970947420302` bleibt.
- Modernes Dashboard (Next.js) + professionelle Landing Page.
- ERLC-Anbindung über **ER:LC Private Server API V2** (`https://api.erlc.gg`, Auth-Header `server-key`, Event-Webhooks mit Ed25519-Signatur) — als austauschbarer Adapter, kein direkter Code über die Schnittstelle.
- Alles **non-dummy, produktionsreif**: echte Implementierungen, keine TODO-Platzhalter.

## 2. Infrastruktur & Repo-Umbau

- GitHub-Repo `Teufel2211/Emergency-Hamburg-Roleplay` → rename auf **Berlin-Roleplay** (lokal + remote via `gh repo rename`).
- Repo wird zum **pnpm-Monorepo mit Turborepo**, neue Struktur:
```
/
  project/
    bot/          → Package `@berlin/bot`     (Node 22, TS strict, discord.js v14.26+)
    dashboard/    → Package `@berlin/dashboard` (Next.js 15, TS, Tailwind, shadcn/ui)
    database/     → Package `@berlin/database`  (Supabase-Migrationen, generierte Client-Types)
    shared/       → Package `@berlin/shared`    (Components-V2-Engine, Settings-Definitionen, ERLC-Types, i18n, Command-Schema)
```
- Alte Struktur wird aus dem Hauptpfad entfernt: `src/`, `api/`, `data/`, `scripts/`, `watch-restart.js`, `vercel.json`, `MASTERPROMPT.md`, `eghr_`-Migrations.
- Bestehender Stand vor Umbau als Git-Tag `v1-legacy` sichern (Notfall-Fallback).
- **Host / Bot-Deployment (selfsync bleibt):** Host pullt `main` → `pnpm install` → `pnpm build` → `pm2 restart`. Host braucht Node 22+. Einmalige Host-Einrichtung durch User; ich liefere Skript + Doku.
- **Vercel:** bestehendes Projekt neu konfiguriert: Root-Directory `project/dashboard`, Framework Next.js. Binding ans umbenannte Repo neu verbinden. Alias `berlin-roleplay.vercel.app`; alter Alias kurzzeitig als Fallback. **Eine** Next.js-App für Landing (`marketing`) + Dashboard (`dashboard`) — ein Deployment.
- **Supabase:** Projekt `hfreshlzwukfaeyveddv` bleibt; **alle `eghr_*`-Tabellen werden gelöscht**, neue `berlin_roleplay_*`-Tabellen entstehen per Migrationen. RLS aktiv auf allen Tabellen.

### Secrets (`.env`, never committed)
- Bestehende Basis: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DISCORD_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `WEB_URL`.
- Neu: `ERLC_DEFAULT_SERVER_KEY` (bzw. pro Server in DB, verschlüsselt), ggf. `DISCORD_GUILD_ID` für Command-Registration.
- Keine Secrets ins Frontend/Logs/Git; nur server-seitig.

## 3. Datenmodell (Supabase / PostgreSQL)

Alle Tabellen mit Präfix `berlin_roleplay_`, PK UUID, `created_at`/`updated_at`, RLS aktiv. Bot nutzt Service-Role (bypasst RLS); Dashboard nutzt `authenticated` mit Staff/Admin-Policies.

### 3.1 Kern / Guilds
| Tabelle | Zweck |
|---|---|
| `berlin_roleplay_guilds` | Eintrag pro Discord-Guild: `id`, `name`, `owner_id`, `settings JSONB` (Default aus `@berlin/shared`), `feature_flags`, `premium`, Timestamps |
| `berlin_roleplay_users` | Discord-User: `id`, `username`, `global_name`, `avatar`, `roles cache` |
| `berlin_roleplay_guild_members` | M:N Guild↔User + Rollen-Cache + Berechtigungs-Level (`role: user|staff|admin`) für Dashboard-Login |

**Settings liegen als JSONB in `berlin_roleplay_guilds.settings`** (Default-Definition in `@berlin/shared`). Kein EAV-Schema. Gezielte disjunkte Felder nur falls nötig.

### 3.2 Feature-Tabellen
| Tabelle | Zweck |
|---|---|
| `berlin_roleplay_tickets` | `id, guild_id, channel_id, user_id, claimer_id, status, panel_id, created_at, closed_at` |
| `berlin_roleplay_ticket_panels` | `id, guild_id, channel_id, message_id, title, description, selection_type, config JSONB` |
| `berlin_roleplay_ticket_messages` | Ticket-Konversations-Cache/Log |
| `berlin_roleplay_ticket_transcripts` | `transcript JSONB`, Datei über Storage |
| `berlin_roleplay_giveaways` | `id, guild_id, channel_id, message_id, prize, winners_count, end_at, host_id, status` |
| `berlin_roleplay_giveaway_entries` | `giveaway_id, user_id` (UNIQUE-Paar) |
| `berlin_roleplay_welcome_config` | `guild_id PK, enabled, channel_id, message_template, role_id, media, component_template_id` |
| `berlin_roleplay_verification_config` | `guild_id PK, enabled, channel_id, role_id, method, restore_on_unverify` |
| `berlin_roleplay_verification_logs` | Verify/Unverify-Historie |
| `berlin_roleplay_audit_logs` | `id, guild_id, actor_id, action, target_type, target_id, details JSONB, created_at` |
| `berlin_roleplay_component_templates` | `id, guild_id, name, description, version, payload JSONB (V2Layout), global/flags, created_by` |
| `berlin_roleplay_component_versions` | `template_id, version, payload JSONB` (Audit/Versionierung) |
| `berlin_roleplay_bot_state` | `guild_id, key, value` — geparkte Nachrichten-IDs, Timer-Status |

### 3.3 ERLC-Tabellen
| Tabelle | Zweck |
|---|---|
| `berlin_roleplay_erlc_servers` | `id, guild_id, name, api_key_enc, base_url, enabled` |
| `berlin_roleplay_erlc_players_cache` | `server_id, roblox_id, username, faction_id, rank, duty, online, last_seen` |
| `berlin_roleplay_erlc_factions` / `berlin_roleplay_erlc_ranks` | Faktionen + Ränge laut API |
| `berlin_roleplay_erlc_duty_state` | Dienst-Status (Duty-System) |
| `berlin_roleplay_erlc_incidents` | `id, guild_id, server_id, type, location, description, created_by, status` |
| `berlin_roleplay_erlc_incident_assignees` | von Incident zugewiesene Einheiten/User |
| `berlin_roleplay_erlc_notifications` | ERLC-Notification-Log |
| `berlin_roleplay_erlc_status_panels` | Discord-Statuspanel-Konfiguration (Templates, Channel, Refresh-Intervall) |
| `berlin_roleplay_erlc_stat_periods` | Statistiken je Zeitraum |
| `berlin_roleplay_erlc_command_history` | Ausgeführte ERLC-Commands (Audit) |
| `berlin_roleplay_erlc_permissions` | Pro-Guild ERLC-Command-Berechtigungen |
| `berlin_roleplay_erlc_webhook_events` | Verifizierte eingehende ErWebhooks (Incident-Automatik + Live-Dashboard) |

### 3.4 Commands / Stats
| Tabelle | Zweck |
|---|---|
| `berlin_roleplay_slash_commands` | Registrierungs-Metadaten |
| `berlin_roleplay_command_usage` | Statistik je Command/User/Guild |

### 3.5 RLS-Strategie
- `authenticated`: SELECT/UPDATE nur auf eigene Guilds, Write-Policies nur `staff`/`admin` (via `berlin_roleplay_guild_members`).
- Bot: Service-Role, kompletter Zugriff.
- Ein Migrationslauf `001_init.sql` löscht alle `eghr_*`-Tabellen, erstellt Extensions + neue Tabellen.

## 4. Bot-Architektur (`@berlin/bot`)

```
project/bot/src/
  index.ts             # Bootstrap: env → DB → Client → Login → Registry laden
  core/
    client.ts          # discord.js Client (Intents: Guilds, GuildMembers, GuildMessages, MessageContent, GuildModeration)
    logger.ts          # winston → console + logs/file
    db.ts              # supabase-Client (Service-Role)
    settings.ts        # Settings aus guilds.settings, Cache 60s + Invalidation
    guilds.ts          # Guild-Provisioning bei guildCreate
    eventRouter.ts     # generischer Event-Dispatch
  core/components/     # ★ Components-V2-Engine
  core/interactions/   # interactionRouter: customId-Prefix → Handler
  core/audit.ts        # Audit-Log-Writer
  commands/            # Slash-Definitionen je Modul (aus @berlin/shared/commands-Schema)
  modules/
    ticket/
    giveaway/
    welcome/
    verification/
    erlc/
    components/        # Component-Template-Panels
    audit/
  registry.ts          # sammelt Commands/Components/Events aus modules/
```

- **Commands:** Slash-Definitionen in `@berlin/shared` (mit deutschen Beschreibungen), Bot registriert + deleget per Name. Deploy-Skript: guild-scoped (`GUILD_ID`) + optional global.
- **Persistente Zustände:** Giveaway-Timer + Ticket-Automation als DB-Zustände mit Re-Hydration beim Start (kein In-Memory-Verlust bei Restart).

## 5. Components-V2-Engine (in `@berlin/shared`)

**Zentrales Konzept: `V2Layout`-JSON als Quell der Wahrheit.**

```ts
type V2Layout = { version: 1; color?: number; children: V2Node[] };
type V2Node =
  | TextBlock        // { type:'text'; content: string; style?: 'paragraph'|'heading'|'list_item' }
  | Section           // { type:'section'; title?: string; blocks: TextBlock[]; accessory?: Thumbnail|Button }
  | Container         // { type:'container'; accentColor?: number; children: V2Node[] }
  | MediaGallery      // { type:'media'; items: {url; description?}[] }
  | Separator         // { type:'separator'; line?: boolean; spacing?: 'small'|'medium'|'large' }
  | FileRef           // { type:'file'; url: string }
  | Row               // { type:'row'; items: (Button|Select)[] }
```

**Renderer:**
1. `renderV2Layout(layout) → discord.js-Payload` — setzt `flags: MessageFlags.IsComponentsV2`, baut `TextDisplayBuilder`/`SectionBuilder`/`ContainerBuilder`/…, validiert ≤40 Komp., ≤4000 Zeichen, verbietet `embeds`/`content`.
2. `renderV2Preview(layout) → React` — pixel-genaue Vorschau im Dashboard (Discord-Chrome), gleiche Engine.
3. `serializeV2/parseV2` — runden-invariant (Dashboard-Edit ↔ Bot gleich).

**Interaction-Routing:** `customId`-Schema `berlin:<modul>:<aktion>:<daten>` (≤100 Zeichen, kompaktes Encoding). Prefix-Dispatch, kein Regex pro Event. Ephemeral-Default je Handler.

**Kernregel erzwungen:** zentraler `send()/edit()`-Wrapper; kein `embeds`-Feld im API-Surface; `no-restricted-imports` verbietet `EmbedBuilder`.

## 6. Features

### 6.1 Ticket-System
- `/ticket setup` → wählt Panel-Typ (Einzel-Ticket / Kategorie-Select mit mehreren Panels).
- Panels als V2-Nachricht (Selector-Section + Button), gespeichert als Template.
- Prozess: Öffnen → Kanal erstellen (Kategorie, Permissions) → Transcript + Claim/Unclaim/Geschlossen/Wiedereröffnet/Umbenennen/Info → Slash + Buttons.
- Automations: Auto-Close nach Inaktivität, Creator-Only-Permissions, Staff-Only-Kanäle.
- transcript: V2-Export als HTML/JSON-Datei → Storage.

### 6.2 Giveaway-System
- `/giveaway create` (Kanal, Preis, Gewinner, Dauer als Slash-Optionen).
- V2-Nachricht mit Live-Update (Endzeit, Teilnehmerzahl), Button `beitreten`/`verlassen`/`teilnehmen`, Teilnahme-Sperre optional (z. B. erforderliche Rolle).
- `/giveaway end` / `reroll` / `cancel` (Staff only). Ergebnisse + Audit.
- Timer aus DB re-hydriert beim Bot-Start.

### 6.3 Welcome-System
- Config: Kanal, V2-Template (Text/Section/Container), automatische Rollenvergabe (eine oder mehrere), Medien.
- Printer auf `guildMemberAdd`; Fallback wenn Kanal fehlt. Audit.

### 6.4 Verifizierung
- Config: Kanal, Rolle, Methoden (`Checkbox-V2`/Button bestätigen, optional interpolierte ID), Restore bei Re-Verify.
- Log-Einträge; bei Unverify werden Rollen entfernt und wiederhergestellt.

### 6.5 Components-V2-Builder (Dashboard-Feature)
- Eigener Dashboard-Bereich „Components": Template-Liste, **Drag-&-Drop/Tree-Editor** der `V2Layout`-JSON-Bausteine (Text/Section/Container/Media/Buttons/Selects), Live-Vorschau per `renderV2Preview`.
- Templates speichern (mit Versionierung) in `berlin_roleplay_component_templates`, Deployment auf einen Kanal per Button (Bot aktiviert via DB-Job/Event).

### 6.6 Audit-Log
- Modul, das Aktionen aus allen anderen Modulen nach `berlin_roleplay_audit_logs` schreibt + optional Discord-Log-Kanal (V2-Nachrichten).

## 7. ERLC-Modul

- **Adapter:** `@berlin/shared/erlc` definiert `ErlcAdapter`-Interface (fetchServer, fetchPlayers, fetchStaff, fetchFactions, fetchRanks, sendCommand) + `mockErlcAdapter` für Tests. Echte Implementierung `ErlcRpcClient` (REST `api.erlc.gg/v2`, `server-key`-Header, Retry/Rate-Limit). Wechsel per Konfiguration.
- **Synchronisation:** Polling-Loop (Intervall je Guild) lädt Serverstatus/Spieler/Faktionen/Ränge → `_players_cache`, `_factions`, `_ranks`.
- **Webhooks:** Ed25519-Verifizierung eingehender Events (`berlin_roleplay_erlc_webhook_events`) für Incident-Automatik + Live-Dashboard-Strom.
- **Features:** Server-Status (online/Spielerzahl/Duty), Spielerliste, Faktions-/Rang-Anzeige, **Dienst-System** (`/erlc duty regiment start/end` …), **Vorfälle** (`/erlc incident …` mit Zuweisung + Notifications), **Notifications** (`/erlc notify …`), **Status-Panels** (Discord-Kanal mit Auto-Refresh), **Statistiken** (je Zeitraum), **Berechtigungen** (`/erlc perms …`), Command-History.
- **Slash-Commands:** `erlc` mit Sub-Commands: `status`, `players`, `staff`, `factions`, `ranks`, `join`, `leave`, `duty`, `incident`, `incident-close`, `notify`, `panel`, `stats`, `perms`, `command` (Roh-Befehl an Spiel, grey-status), alle mit deutschen Texten, V2-Output, Audit + Permissions-Check.
- Slash-Event-Typen (`;`-Befehle): Optionale Zusatzfeatures mit Sicherheitsbau (Event-Validation).

## 8. Dashboard & Landing (`@berlin/dashboard`, Next.js 15)

- **Auth:** Discord OAuth2 (identify + guilds). Session-basiert (Token in HttpOnly-Cookie, Refresh via Refresh-Token in DB). Dashboard-Login nur für Mitglieder mit `staff`/`admin` in `berlin_roleplay_guild_members`.
- **Routing:**
  - `marketing/` → Landing: Hero, Trust, Feature-Cards, Dashboard-Vorschau, Components-V2-Sektion, ERLC-Sektion, CTA, Footer (Dark Mode, Framer Motion, responsive).
  - `dashboard/` → Server-Übersicht (Guilds-Auswahl), pro Feature: Tickets, Giveaways, Welcome, Verification, Components-Builder, ERLC, Audit, Statistik.
- **Stack:** Tailwind CSS, shadcn/ui, Framer Motion, Server Components + schlanke API-Routes (Supabase-Frontend-Client mit RLS), Dark Mode default.
- **Vorschau:** `renderV2Preview` importiert aus `@berlin/shared` — identische Darstellung wie Bot.

## 9. Slash-Commands (komplette Liste)

- **Tickets:** `ticket setup`, `ticket create`, `ticket close`, `ticket reopen`, `ticket delete`, `ticket claim`, `ticket unclaim`, `ticket add`, `ticket remove`, `ticket rename`, `ticket tag`, `ticket transcript`, `ticket info`.
- **Giveaways:** `giveaway create`, `giveaway end`, `giveaway reroll`, `giveaway cancel`.
- **Welcome:** `welcome set`, `welcome test`, `welcome disable`.
- **Verifizierung:** `verify set`, `verify check`, `verify unverify` (Staff), `verify restore`.
- **Components:** `components deploy <template> [channel]`, `components list`.
- **ERLC:** `erlc status`, `erlc players`, `erlc staff`, `erlc factions`, `erlc ranks`, `erlc join`, `erlc leave`, `erlc duty <start|end>`, `erlc incident <create|close|assign>`, `erlc notify`, `erlc panel <create|delete|refresh>`, `erlc stats <period>`, `erlc perms <view|set>`, `erlc command <cmd>`.
- **Audit:** `audit view [filter]` (optional).
- **Admin:** `admin reload-settings`, `admin sync-guilds` (optional).

## 10. Qualität

- **Tests:** Vitest für `@berlin/shared` (V2Layout-Renderer, Adapter-Mock, Settings-Merge) + Bot-Module (Service-Layer mit Fake-DB). Kein Live-Discord in Unit-Tests.
- **Lint/Format:** ESLint + Prettier, TS strict, `no-restricted-imports` (EmbedBuilder), Type-Only-Imports.
- **CI:** GitHub Actions: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` je Package.
- **Logs:** winston, Secret-Redaction (Keys nie in Logs), zentrale Formatierung.

## 11. Reihenfolge / Phasen

1. **Phase 0 (Infra):** Monorepo aufsetzen, Repo-Rename, `v1-legacy`-Tag, `.env.example`, CI.
2. **Phase 1 (Daten):** `001_init.sql` (drop eghr_, create berlin tables + RLS), generierte Types.
3. **Phase 2 (Shared-Kern):** `@berlin/shared` — V2Layout-Types, Renderer (discord.js + Preview), Settings-Definitionen, Command-Schema, i18n.
4. **Phase 3 (Bot-Kern):** Bootstrap, Client, Registry, Settings-Service, Interaction-Router, Audit.
5. **Phase 4 (Features):** Ticket → Giveaway → Welcome → Verification → Components-Deployment.
6. **Phase 5 (ERLC):** Adapter + RPC-Client, Polling, Webhooks, Duty/Incidents/Notifications/Panels/Stats/Perms, `erlc`-Commands.
7. **Phase 6 (Dashboard/Landing):** Next.js, OAuth, Marketing-Seite, Dashboard-Seiten, Components-Builder mit Live-Vorschau.
8. **Phase 7 (Go-live):** deployment, selfsync-Skript + Host-Doku, Vercel-Alias, Switchover, eghr-Cleanup.

## 12. Getroffene Entscheidungen (User-Freigaben)

- Umbau im bestehenden Repo; Alt-Code wird ersetzt. ✔
- Repo-Rename auf Berlin-Roleplay. ✔
- Bestehender Bot wird weiterverwendet (Token/Guilds bleiben). ✔
- ERLC: echte ER:LC Private Server API V2; Adapter mit Mock für Tests. ✔
- Supabase-Projekt bleibt; `eghr_*`-Tabellen werden **gelöscht**; kompletter Neustart der Daten. ✔
- Settings als JSONB in `berlin_roleplay_guilds`. ✔
- V2Layout-JSON als Quell der Wahrheit (Bot + Dashboard rendern daraus). ✔
- Eine Next.js-App (Landing + Dashboard) auf Vercel. ✔
- pnpm/Turborepo-Monorepo. ✔
- Discord Components V2 als ausschließliche Nachrichten-Technik. ✔
- Alle Abschnitte inkl. 4–7 vom User bestätigt („bestätige hiermit alles weitere"). ✔