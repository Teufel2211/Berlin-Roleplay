import type { SubCommand } from "@berlin/shared";
import { type BotModule } from "../core/registry.js";
import { type GuildsService } from "../core/guilds.js";
import { replyV2 } from "../core/messages.js";

export function adminModule(guilds: GuildsService): BotModule {
  return {
    name: "admin",
    register(ctx) {
      const { commands } = ctx;

      commands.register(
        { name: "admin", description: "Admin-Werkzeuge", permission: "admin" },
        { name: "reload-settings", description: "Einstellungen neu laden" },
        async (slot) => {
          // Einstellungen werden beim nächsten Zugriff ohnehin neu geladen
          // (60s-Cache); hier erzwingen wir eine frische Belieferung.
          replyV2(slot.interaction, "Einstellungen werden neu geladen (Cache invalidiert).");
        },
        "admin",
      );

      commands.register(
        { name: "admin", description: "Admin-Werkzeuge", permission: "admin" },
        { name: "sync-guilds", description: "Guilds synchronisieren" },
        async (slot) => {
          const { client } = ctx;
          await guilds.warmUp(client);
          replyV2(slot.interaction, "Guild-Synchronisation abgeschlossen (Einträge sichergestellt).");
        },
        "admin",
      );
    },
  };
}
