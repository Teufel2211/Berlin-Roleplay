import {
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";

export type ComponentInteraction = ButtonInteraction | AnySelectMenuInteraction;
export type AnyInteraction = ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

export interface InteractionContext {
  interaction: AnyInteraction;
  guildId: string;
  userId: string;
  /** Nach 'berlin:<modul>:<aktion>' verbleibender Daten-Teil */
  data: string;
}

/**
 * Interaction-Router: customId-Prefix → Handler (Spec §5).
 * Schema: `berlin:<modul>:<aktion>:<daten-compact>` (≤100 Zeichen).
 * Prefix-Dispatch, kein Regex pro Event.
 */
export class InteractionRouter {
  #handlers = new Map<string, (ctx: InteractionContext) => Promise<void>>();

  /** Handler unter exaktem Prefix 'berlin:<modul>:<aktion>' registrieren. */
  on(prefix: string, handler: (ctx: InteractionContext) => Promise<void>): void {
    if (!prefix.startsWith("berlin:")) {
      throw new Error(`Interaction-Prefix muss mit 'berlin:' beginnen: ${prefix}`);
    }
    this.#handlers.set(prefix, handler);
  }

  /** customId parsen und passenden Handler ausführen. false = kein Handler. */
  async route(customId: string, interaction: AnyInteraction): Promise<boolean> {
    const ctx = parseCustomId(customId, interaction);
    if (!ctx) return false;

    // Längster zuerst: exakt (Modul+Aktion), dann nur Modul.
    const candidates = [ctx.prefix, ctx.module];
    for (const candidate of candidates) {
      const handler = this.#handlers.get(candidate);
      if (handler) {
        await handler(ctx);
        return true;
      }
    }
    return false;
  }
}

function parseCustomId(
  customId: string,
  interaction: AnyInteraction,
): (InteractionContext & { prefix: string; module: string }) | null {
  if (!interaction.inCachedGuild() || !interaction.guildId || !interaction.user) {
    return null;
  }
  const [mod, moduleId, action, ...dataParts] = customId.split(":");
  if (mod !== "berlin" || !moduleId) {
    return null;
  }
  const data = action ? [action, ...dataParts].join(":") : dataParts.join(":");
  return {
    prefix: `berlin:${moduleId}${action ? `:${action}` : ""}`,
    module: `berlin:${moduleId}`,
    data,
    interaction,
    guildId: interaction.guildId,
    userId: interaction.user.id,
  };
}