const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { config } = require('./config');

fs.mkdirSync(config.logDir, { recursive: true });

const logger = winston.createLogger({
  level: config.debug ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(config.logDir, 'app.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
  ],
});

module.exports = logger;
