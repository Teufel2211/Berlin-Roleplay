const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error('SUPABASE_DB_URL fehlt in .env');
    console.error('Beispiel: postgresql://postgres:<passwort>@db.hfreshlzwukfaeyveddv.supabase.co:5432/postgres');
    process.exit(1);
  }
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) {
    console.error('Keine Migrationen gefunden in supabase/migrations/');
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  for (const file of files) {
    console.log(`Anwenden: ${file}`);
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await client.query(sql);
  }
  await client.end();
  console.log('Migrationen erfolgreich angewendet.');
}

main().catch((err) => {
  console.error(`Migration fehlgeschlagen: ${err.message}`);
  process.exit(1);
});
