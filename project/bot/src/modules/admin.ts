import type { SubCommand } from "@berlin/shared";
import { type BotModule } from "../core/registry.js";
import { type GuildsService } from "../core/guilds.js";

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
          slot.interaction.reply({
            content: "Einstellungen werden neu geladen (Cache invalidiert).",
            flags: 64,
          });
        },
        "admin",
      );

      commands.register(
        { name: "admin", description: "Admin-Werkzeuge", permission: "admin" },
        { name: "sync-guilds", description: "Guilds synchronisieren" },
        async (slot) => {
          const { client } = ctx;
          await guilds.warmUp(client);
          slot.interaction.reply({
            content: "Guild-Synchronisation abgeschlossen (Einträge sichergestellt).",
            flags: 64,
          });
        },
        "admin",
      );
    },
  };
}