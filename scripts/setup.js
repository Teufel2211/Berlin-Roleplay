const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const { config, DEFAULT_SETTINGS } = require('../src/config');
const logger = require('../src/logger');
const { getClient, TABLES } = require('../src/supabase');
const { client, login } = require('../src/discord/client');

async function seedSettings() {
  const entries = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await getClient().from(TABLES.settings).upsert(entries, { onConflict: 'key' });
  if (error) throw error;
  logger.info(`Settings-Defaults gesetzt (${entries.length} Keys)`);
}

async function ensurePassword() {
  if (config.dashboardPasswordHash) {
    logger.info('DASHBOARD_PASSWORD_HASH ist bereits gesetzt.');
    return;
  }
  const password = crypto.randomBytes(6).toString('base64url').slice(0, 10);
  const hash = await bcrypt.hash(password, 10);
  const envPath = path.join(__dirname, '..', '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  const line = `DASHBOARD_PASSWORD_HASH=${hash}`;
  if (content.match(/^DASHBOARD_PASSWORD_HASH=.*$/m)) {
    content = content.replace(/^DASHBOARD_PASSWORD_HASH=.*$/m, line);
  } else {
    content += (content.endsWith('\n') ? '' : '\n') + line + '\n';
  }
  fs.writeFileSync(envPath, content, 'utf8');
  console.log('');
  console.log('  ======================================================');
  console.log(`   Dashboard-Passwort (einmalig): ${password}`);
  console.log('   Hash wurde in .env gespeichert.');
  console.log('  ======================================================');
  console.log('');
  logger.info('Neues Dashboard-Passwort generiert.');
}

async function testBotToken() {
  if (!config.discordToken) {
    logger.warn('DISCORD_TOKEN fehlt – Bot-Token-Status wird übersprungen.');
    return;
  }
  try {
    await login();
    logger.info(`Bot-Token gültig (eingeloggt als ${client.user.tag})`);
    await client.destroy();
  } catch (err) {
    logger.error(`Bot-Token ungültig: ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  const missing = config.requiredSecrets.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Fehlende Pflicht-Secrets in .env: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    const { count } = await getClient().from(TABLES.settings).select('id', { count: 'exact', head: true });
    logger.info(`Datenbank erreichbar (eghr_settings: ${count} Zeilen)`);
  } catch (err) {
    logger.error(`Supabase-Verbindung fehlgeschlagen: ${err.message}`);
    process.exit(1);
  }

  await seedSettings();
  await ensurePassword();
  await testBotToken();

  if (process.exitCode) {
    console.error('Setup abgeschlossen mit Fehlern.');
    process.exit(process.exitCode);
  }
  console.log('Setup erfolgreich. Starte mit: npm start');
}

main().catch((err) => {
  logger.error(`Setup fehlgeschlagen: ${err.stack || err.message}`);
  process.exit(1);
});
