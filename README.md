# Emergency Hamburg Roleplay

A modular Discord bot and server management dashboard for **Emergency Hamburg Roleplay**.

The project combines a Discord.js bot, Supabase/PostgreSQL persistence, and a web dashboard for multi-guild administration.

## Current Features

### Giveaway System
- `/giveaway create`
- `/giveaway end`
- `/giveaway reroll`
- Configurable duration, winners, requirements, and role-based bonus entries
- Active giveaways are visible in the dashboard
- Active giveaway selection with Discord autocomplete for `/giveaway end`

### Ticket System
- Ticket categories with dashboard configuration
- Category selection panels
- Ticket creation with channel permissions
- Ticket questions and modal forms
- Claim / unclaim
- Close / reopen / delete
- Add / remove members (via `/ticket` subcommands)
- Rename tickets
- Tags
- Ticket activity and event logging
- Auto-close and auto-delete scheduling
- HTML transcripts with dashboard viewer
- Transcript message storage
- Dashboard ticket statistics
- Multi-guild ticket configuration
- Server-side permission checks

All ticket-related database tables use the required `eghr_` prefix.

### Dashboard
- Discord OAuth2 login
- Multi-server dashboard
- Per-guild configuration
- Owner access to bot-installed servers
- Server overview
- Ticket administration
- Giveaway administration
- Channel and role selection
- Audit logging

## Technology

- Node.js 22+
- Discord.js v14
- Express / EJS
- Supabase / PostgreSQL
- Discord OAuth2

## Requirements

- Node.js 22 or newer
- A Discord application and bot
- A Supabase project
- Discord OAuth2 credentials for the dashboard

## Environment Variables

Create a `.env` file based on `.env.example`.

```env
DISCORD_TOKEN=              # Bot token
CLIENT_ID=                  # Application client ID
DISCORD_CLIENT_SECRET=      # OAuth2 client secret for dashboard login
OWNER_USER_ID=              # Dashboard full-access user ID
SUPABASE_URL=               # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=  # Service role key (server-side only)
SUPABASE_DB_URL=            # Postgres connection string
WEB_URL=http://localhost:3000
SESSION_SECRET=change-me    # Random string for express-session
WEB_PORT=3000
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to browser-side code.

Add the OAuth redirect URI `<WEB_URL>/dashboard/auth/discord/callback` in the Discord Developer Portal.

## Installation

```bash
npm install
npm run migrate   # Apply database migrations
npm run deploy    # Register slash commands (optional, for /ticket and /giveaway)
npm start         # Start bot + dashboard
```

The repository also includes a file watcher that can restart the bot after a quiet period following file changes.

## Development

Useful scripts:

```bash
npm start         # Start bot + dashboard
npm run migrate   # Apply database migrations
npm run deploy    # Register slash commands
npm run lint      # Syntax-check all JS/EJS/SQL files
```

## Supabase Naming Rule

All ticket-related tables must start with:

```text
eghr_
```

Examples:

```text
eghr_tickets
eghr_ticket_settings
eghr_ticket_categories
eghr_ticket_events
eghr_ticket_assignments
eghr_ticket_transcripts
eghr_ticket_transcript_messages
```

Do not create new ticket tables without this prefix.

## Multi-Guild Architecture

Every server-specific setting and ticket record is scoped by `guild_id`.

The application must never apply settings from one Discord server to another. Dashboard access is checked against the authenticated Discord session and the selected guild.

## Security

The project expects security-sensitive checks to happen server-side.

Important rules:
- Keep Supabase service-role credentials server-side.
- Validate Discord guild access before changing settings.
- Validate Discord permissions/roles before destructive ticket actions.
- Use CSRF protection for dashboard forms.
- Use `guild_id` on server-specific data access.
- Keep technical errors in logs and show safe error messages to users.

## Project Structure

```text
src/
├── commands/          # /giveaway, /ticket slash commands
├── discord/           # client, deploy, embeds, helpers, events
├── services/          # per-feature DB/domain logic
├── web/               # Express server, auth, dashboard routes, EJS views
├── config.js          # Env access, DEFAULT_SETTINGS, REQUIRED_SECRETS
├── supabase.js        # Supabase client, TABLES map, withRetry
└── index.js           # Entry point

supabase/
└── migrations/        # 001_init.sql (schema + defaults)

scripts/
└── migrate.js, setup.js, deploy.js, lint.js
```

## Ticket Slash Commands

```text
/ticket setup       – Panel in Kanal senden
/ticket create      – Ticket erstellen (Kategorie-ID)
/ticket close       – Ticket schließen
/ticket reopen      – Ticket wieder öffnen
/ticket delete      – Ticket löschen
/ticket claim       – Ticket übernehmen
/ticket unclaim     – Ticket freigeben
/ticket add         – Benutzer hinzufügen
/ticket remove      – Benutzer entfernen
/ticket rename      – Ticket umbenennen
/ticket tag         – Tag hinzufügen
/ticket transcript  – Transcript erstellen
/ticket info        – Ticket-Info anzeigen
```

Commands are registered globally via `npm run deploy`.

## Production Notes

Before running the bot in production:

1. Configure all environment variables in `.env`
2. Run `npm run migrate` to apply database migrations
3. Invite the bot with the required permissions
4. Configure the server from the dashboard (staff roles, channels, ticket categories, etc.)
5. Post the ticket/verify panels
6. Verify transcripts and audit logging work as expected

## Repository

- GitHub: https://github.com/Teufel2211/Emergency-Hamburg-Roleplay

## Status

Under active development. Ticket system, giveaway system, verification, applications, interviews, and team management are implemented on the Express/EJS dashboard.
