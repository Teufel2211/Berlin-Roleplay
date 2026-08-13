require('dotenv').config();
const { registerCommands } = require('../src/discord/deploy');
const logger = require('../src/logger');

registerCommands()
  .then(() => {
    logger.info('Slash-Kommandos registriert.');
    process.exit(0);
  })
  .catch((err) => {
    logger.error(`Deploy fehlgeschlagen: ${err.message}`);
    process.exit(1);
  });
