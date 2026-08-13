const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { config } = require('./config');

const transports = [new winston.transports.Console()];
try {
  fs.mkdirSync(config.logDir, { recursive: true });
  transports.push(
    new winston.transports.File({
      filename: path.join(config.logDir, 'app.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    })
  );
} catch (err) {
  console.error(`[logger] Datei-Logging nicht verfügbar: ${err.message}`);
}

const logger = winston.createLogger({
  level: config.debug ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports,
});

module.exports = logger;
