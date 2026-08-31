import { mkdirSync } from "node:fs";
import { join } from "node:path";
import winston from "winston";
import { redact } from "./config.js";

const LOG_DIR = join(process.cwd(), "logs");
mkdirSync(LOG_DIR, { recursive: true });

/** Winston-Logger: console + Datei, mit Secret-Redaction und einheitlichem Format. */
export function createLogger(level: string, label: string): winston.Logger {
  const format = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    winston.format.align(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const msg = redact(String(info.message ?? ""));
      const meta = info.stack ? `\n${redact(String(info.stack))}` : "";
      return `${info.timestamp} ${info.level.toUpperCase()} [${info.label}] ${msg}${meta}`;
    }),
    winston.format.label({ label }),
  );

  return winston.createLogger({
    level,
    format,
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: join(LOG_DIR, "bot.log"), maxsize: 5_242_880, maxFiles: 3 }),
    ],
  });
}

export type Logger = winston.Logger;

/**
 * Redaction für serialisierte Objekte: rekursiv alle keys, die nach secret/token/key/password
 * aussehen, durch "<redacted>" ersetzen. Nie Secrets in Logs.
 */
export function sanitizeForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|token|key|password|authorization|server.?key|service.?role/i.test(k)) {
        out[k] = "<redacted>";
      } else {
        out[k] = sanitizeForLog(v);
      }
    }
    return out;
  }
  if (typeof value === "string") return redact(value);
  return value;
}