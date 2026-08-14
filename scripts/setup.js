require('dotenv').config();
const { config } = require('../src/config');
const logger = require('../src/logger');
const { getClient, TABLES } = require('../src/supabase');
const { client, login } = require('../src/discord/client');

async function testBotToken() {
  if (!config.discordToken) {
    logger.warn('DISCORD_TOKEN fehlt – Bot-Token-Status wird übersprungen.');
    return;
  }
  try {
    await login();
    logger.info(`Bot-Token gültig (eingeloggt als ${client.user.tag}, ${client.guilds.cache.size} Server)`);
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
    const { count } = await getClient().from(TABLES.settings).select('key', { count: 'exact', head: true });
    logger.info(`Datenbank erreichbar (eghr_settings: ${count} Zeilen)`);
  } catch (err) {
    logger.error(`Supabase-Verbindung fehlgeschlagen: ${err.message}`);
    process.exit(1);
  }

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
