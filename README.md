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
The current repository contains a production-oriented ticket foundation with:
- Ticket categories
- Category selection panels
- Ticket creation and channel permissions
- Ticket questions and modal forms
- Claim / unclaim
- Close / reopen / delete
- Add / remove members
- Rename tickets
- Priorities
- Tags
- Ticket activity and event logging
- Auto-close and auto-delete scheduling
- HTML transcripts
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

The current implementation is based on the existing repository architecture:

- Node.js 22+
- Discord.js v14
- Express
- EJS
- Supabase / PostgreSQL
- Discord OAuth2

> Note: The repository currently uses the existing Express/EJS JavaScript dashboard architecture. It is not yet a Next.js/React/TypeScript rewrite.

## Requirements

- Node.js 22 or newer
- A Discord application and bot
- A Supabase project
- Discord OAuth2 credentials for the dashboard

## Environment Variables

Create a `.env` file based on `.env.example`.

Required values include:

```env
DISCORD_TOKEN=
CLIENT_ID=
DISCORD_CLIENT_SECRET=
OWNER_USER_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WEB_URL=http://localhost:3000
SESSION_SECRET=change-me
WEB_PORT=3000
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to browser-side code.

## Installation

```bash
npm install
```

Run the database setup/migrations used by the repository:

```bash
npm run migrate
```

Start the application:

```bash
npm start
```

The repository also includes a file watcher that can restart the bot after a quiet period following file changes.

## Development

Useful scripts:

```bash
npm start
npm run bot
npm run dev
npm run migrate
npm run setup
npm run deploy
npm run lint
```

## Automatic Restart Watcher

`watch-restart.js` uses Chokidar to watch the project and restart the bot only after **30 seconds with no further file changes**.

Ignored paths include generated/runtime directories such as:

```text
node_modules/
.git/
logs/
data/
*.log
```

This prevents log writes and other runtime changes from continuously restarting the bot.

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
├── commands/
├── discord/
├── services/
├── web/
├── config.js
├── supabase.js
└── index.js

supabase/
└── migrations/

scripts/
└── ...
```

Important services currently include giveaway and professional ticket handling.

## Ticket Slash Commands

The current professional ticket command provides:

```text
/ticket setup
/ticket create
/ticket close
/ticket reopen
/ticket delete
/ticket claim
/ticket unclaim
/ticket add
/ticket remove
/ticket rename
/ticket priority
/ticket tag
/ticket transcript
/ticket info
```

Commands should still be registered through the repository's normal command deployment/startup flow.

## Production Notes

Before running the bot in production:

1. Configure all Discord and Supabase environment variables.
2. Run the database migrations.
3. Invite the bot with the permissions required for ticket channel management.
4. Configure the server from the dashboard.
5. Configure ticket categories, roles, channels, priorities, tags, and transcript settings.
6. Post the ticket panel.
7. Verify that transcript storage and audit logging work as expected.

## Repository

- GitHub: https://github.com/Teufel2211/Emergency-Hamburg-Roleplay

## Status

This repository is under active development. The ticket system and giveaway system are implemented on top of the existing bot/dashboard architecture, while some larger dashboard builder features remain candidates for future iterations.
