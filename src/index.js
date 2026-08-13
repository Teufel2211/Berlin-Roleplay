const { config } = require('./config');
const logger = require('./logger');
const { client, login } = require('./discord/client');
const { registerEvents } = require('./discord/events');
const { startWebServer } = require('./web/server');

process.on('unhandledRejection', (reason) => logger.error(`unhandledRejection: ${reason}`));
process.on('uncaughtException', (err) => logger.error(`uncaughtException: ${err.stack}`));

async function main() {
  const missing = config.requiredSecrets.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('');
    console.error('  ❌ Fehlende Pflicht-Secrets in .env:');
    missing.forEach((k) => console.error(`     - ${k}`));
    console.error('');
    console.error('  Anleitung:');
    console.error('    1. Kopiere .env.example zu .env');
    console.error('    2. Trage die Secrets ein (Discord + Supabase)');
    console.error('    3. npm run migrate && npm run setup && npm run deploy');
    console.error('');
    process.exit(1);
  }

  try {
    registerEvents(client);
    await login();
    startWebServer();
  } catch (err) {
    logger.error(`Start fehlgeschlagen: ${err.stack || err.message}`);
    process.exit(1);
  }
}

main();
