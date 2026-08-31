/**
 * @berlin/database — wendet SQL-Migrationen aus migrations/*.sql an.
 *
 * Verwendet SUPABASE_DB_URL (Postgres-Connection-String) und eine lokale
 * Tabelle `schema_migrations` zur Nachverfolgung bereits angewendeter Dateien.
 *
 *   pnpm --filter @berlin/database run push
 *
 * Verbindet als Postgres-Superuser/Service-Rolle (kein RLS-Bypass nötig, da
 * Rolle Owner/Rechte besitzt). Secret stammt aus `.env` (Root) bzw. Prozess-Env.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import "dotenv/config";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const connectionString =
  process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Fehlend: SUPABASE_DB_URL (oder DATABASE_URL) in .env");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows: appliedRows } = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(appliedRows.map((r) => r.name));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("Keine ausstehenden Migrationen.");
    await client.end();
    return;
  }

  console.log(`Anzuwenden (${pending.length}):`);
  for (const file of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`  → ${file}`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`    ✓ done`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`    ✗ FEHLGESCHLAGEN: ${file}`);
      console.error(err);
      process.exit(1);
    }
  }

  await client.end();
  console.log("Fertig.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});