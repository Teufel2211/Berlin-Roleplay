# AGENTS.md

Guidance for AI agents working on this repository: **Emergency Hamburg Roleplay** – Discord-Bot + Website-Dashboard.

---

# Overview

One Node.js process (`discord.js` v14, CommonJS) runs both the Discord bot and an Express/EJS web dashboard on one port. Data lives in Supabase (`hfreshlzwukfaeyveddv`); all tables use the `eghr_` prefix. RLS is enabled on all tables; no policies are defined, so only the service role key (used by the bot) can access them.

---

# Key Directories

```
.
├── src/
│   ├── index.js              # Entry point (secrets check, bot login, web start)
│   ├── config.js             # Env access, DEFAULT_SETTINGS, REQUIRED_SECRETS
│   ├── logger.js             # Winston logger -> logs/app.log
│   ├── supabase.js           # Supabase client, TABLES map (eghr_ prefix), withRetry
│   ├── discord/              # client, deploy, embeds, helpers, events
│   ├── commands/             # giveaway, ticket (only registered slash commands)
│   ├── services/             # per-feature DB/domain logic (verify, warteraum, giveaway, application, interview, team, moderation, welcome, ticket, settings, audit)
│   └── web/                  # server, auth, settings/audit routes, views (EJS), public/css
├── scripts/                  # migrate.js, setup.js, deploy.js, lint.js
├── supabase/migrations/      # 001_init.sql (schema + default settings)
├── .env.example              # Template; copy to .env and fill secrets
└── MASTERPROMPT.md           # Original spec (German), single source of truth for behavior
```

---

# Commands

```bash
npm run migrate   # Applies supabase/migrations via pg
npm run setup     # Generates DASHBOARD_PASSWORD_HASH and writes it to .env
npm run deploy    # Registers slash commands to the guild
npm run lint      # Syntax-checks all JS/EJS/SQL files
npm start         # Starts bot + dashboard (reads .env)
```

---

# Conventions

- All embeds and bot messages are **German**; footer: `Emergency Hamburg Roleplay • <Server-Name>`.
- Registered slash commands: `/giveaway` (`create`, `end`, `reroll`) and `/ticket` (`setup`, `create`, `close`, `reopen`, `delete`, `claim`, `unclaim`, `add`, `remove`, `rename`, `tag`, `transcript`, `info`). All other flows (verify, applications, interviews, tickets) run through panels/buttons/modals handled in `src/discord/events.js`; legacy command files were removed in commit `268c509`.
- Roles are configurable via settings keys (`staff_role`, `admin_role`, `warteraum_role`, ...); Staff = moderator, Admin = admin.
- All tables/queries use the `eghr_` prefix (defined once in `src/supabase.js`).
- `MASTERPROMPT.md` is the behavioral source of truth. If spec and code diverge, ask before changing either. Note: its `/verify`, `/warteraum`, `/bewerbung`, and `/interview` command chapters are outdated — those flows are now panel/button-driven (see Conventions).
- RLS is enabled on all Supabase tables (no policies). The bot uses the service role key, which bypasses RLS; anon/authenticated clients get no access.
- No code comments unless asked; follow existing style (CommonJS, `require`/`module.exports`).

---

# Secrets & Setup

Required in `.env` (never committed; `.env` is gitignored):

| Key | Purpose |
|-----|---------|
| `DISCORD_TOKEN` | Bot token |
| `CLIENT_ID` / `GUILD_ID` | Command registration target |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret for the Discord dashboard login |
| `SUPABASE_URL` | Project URL (prefilled) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `SUPABASE_DB_URL` | Postgres connection string (needs password) |
| `SESSION_SECRET` | Session signing |
| `WEB_URL` | Public base URL (used for OAuth redirect + CSRF host check) |
| `WEB_PORT` | Dashboard port (default 3000) |

Dashboard login is **Discord OAuth2** (`identify` scope). Only guild members with the configured `staff_role` or `admin_role` (settings keys) may log in. Password login (`DASHBOARD_USER`/`DASHBOARD_PASSWORD_HASH`, `npm run setup`) is no longer used.

Setup order: fill `.env` → `npm run migrate` → `npm run deploy` → `npm start`. Add the OAuth redirect URI `<WEB_URL>/dashboard/auth/discord/callback` in the Discord Developer Portal.

---

# Verification

- `npm run lint` must pass (all files).
- Smoke test: start app, check `GET /api/status` returns 200 and login page renders.
- DB changes: keep `supabase/migrations/001_init.sql` in sync with applied migrations.
- After changing commands: `npm run deploy`.

---

# Notes

- Supabase project: `hfreshlzwukfaeyveddv` (https://hfreshlzwukfaeyveddv.supabase.co).
- The service role key / DB password are NOT retrievable via MCP tools; user must provide them.
- MASTERPROMPT.md was cleaned of Roblox/webhook content; that cleanup must not be reverted.

---

# Reporting (user request)

After **every** change to the bot or dashboard code, always tell the user briefly what was changed last (commit hash, files, and what it does). Do this even if the change seems trivial.
