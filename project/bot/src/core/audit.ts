import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES } from "./db.js";

export interface AuditEntry {
  guildId: string;
  actorId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

/** Audit-Log-Writer: Aktionen persistieren nach berlin_roleplay_audit_logs. */
export class AuditService {
  readonly #db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async log(entry: AuditEntry): Promise<void> {
    const { error } = await this.#db.from(TABLES.auditLogs).insert({
      guild_id: entry.guildId,
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      details: entry.details ?? {},
    });

    if (error) {
      throw new Error(`Audit schreiben fehlgeschlagen: ${error.message}`);
    }
  }
}