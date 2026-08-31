import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES } from "../core/db.js";
import { verifyEd25519 } from "./verify.js";
import type { Logger } from "../core/logger.js";

const MAX_BODY = 1024 * 1024;

/**
 * ER:LC-Webhook-Listener:
 * - `POST /erlc/webhook` mit `X-Signature-Ed25519`, `X-Timestamp`-Headern + Public-Key
 * - verifizierte Events → `berlin_roleplay_erlc_webhook_events`
 * - liefert 401 bei ungültiger Signatur, 404 sonst.
 */
export class ErlcWebhookHandler {
  readonly #db: SupabaseClient;
  readonly #logger: Logger;
  readonly #publicKey: string;
  readonly server = createServer((req, res) => this.handle(req, res));

  constructor(db: SupabaseClient, logger: Logger, publicKey: string) {
    this.#db = db;
    this.#logger = logger;
    this.#publicKey = publicKey;
  }

  listen(port = 8080): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        const addr = this.server.address() as AddressInfo;
        this.#logger.info(`ER:LC-Webhook-Listener auf Port ${addr.port}`);
        resolve();
      });
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST" || req.url !== "/erlc/webhook") {
      res.writeHead(404).end("Not Found");
      return;
    }

    const body = await readBody(req, MAX_BODY);
    const signature = req.headers["x-signature-ed25519"];
    if (!signature || typeof signature !== "string") {
      res.writeHead(401).end("signature missing");
      return;
    }

    if (!verifyEd25519(body, signature, this.#publicKey)) {
      this.#logger.warn("ER:LC-Webhook: ungültige Signatur abgelehnt.");
      res.writeHead(401).end("invalid signature");
      return;
    }

    try {
      const payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      await this.#db.from(TABLES.erlcWebhookEvents).insert({
        guild_id: typeof payload.guildId === "string" ? payload.guildId : "",
        server_id: typeof payload.serverId === "string" ? payload.serverId : "",
        event_type: typeof payload.event === "string" ? payload.event : "unknown",
        payload,
        verified: true,
      });
      res.writeHead(200).end("ok");
    } catch (err) {
      this.#logger.error(`ER:LC-Webhook speichern fehlgeschlagen: ${String(err)}`);
      res.writeHead(500).end("store error");
    }
  }
}

function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}