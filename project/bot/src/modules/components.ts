import { findCommand, parseV2, V2MessageBuilder } from "@berlin/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BotModule } from "../core/registry.js";
import { TABLES } from "../core/db.js";
import { replyV2 } from "../core/messages.js";

export function componentsModule(db: SupabaseClient): BotModule {
  return {
    name: "components",
    register({ commands }) {
      const def = findCommand("components")!;

      commands.register(def, def.subCommands!.find((sub) => sub.name === "list")!, async (ctx) => {
        const { data, error } = await db
          .from(TABLES.componentTemplates)
          .select("name, version")
          .eq("guild_id", ctx.interaction.guildId!)
          .order("name");
        if (error) {
          await replyV2(ctx.interaction, "Templates konnten nicht geladen werden.");
          return;
        }
        const templates = (data ?? []) as { name: string; version: number }[];
        await replyV2(
          ctx.interaction,
          templates.length === 0
            ? "Es sind noch keine Components-V2-Templates vorhanden."
            : templates.map((template) => `• ${template.name} (Version ${template.version})`).join("\n"),
        );
      });

      commands.register(def, def.subCommands!.find((sub) => sub.name === "deploy")!, async (ctx) => {
        const name = ctx.interaction.options.getString("template", true);
        const channelOption = ctx.interaction.options.getChannel("kanal", false);
        const channel = channelOption ?? ctx.interaction.channel;
        if (!channel || !("send" in channel)) {
          await replyV2(ctx.interaction, "Bitte einen Textkanal auswählen.");
          return;
        }

        const { data: template, error } = await db
          .from(TABLES.componentTemplates)
          .select("name, payload")
          .eq("guild_id", ctx.interaction.guildId!)
          .eq("name", name)
          .maybeSingle();
        if (error || !template) {
          await replyV2(ctx.interaction, "Template nicht gefunden.");
          return;
        }

        try {
          const layout = parseV2(JSON.stringify(template.payload));
          await (channel as { send(payload: unknown): Promise<unknown> }).send(new V2MessageBuilder(layout).build());
          await replyV2(ctx.interaction, `Template **${name}** wurde in <#${channel.id}> bereitgestellt.`);
        } catch {
          await replyV2(ctx.interaction, "Das Template enthält kein gültiges Components-V2-Layout.");
        }
      });
    },
  };
}
