import { type CacheType, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { commands, type CommandDef, type SubCommand, type GuildSettings } from "@berlin/shared";
import { hasPermission, permissionDenied, type PermissionLevel } from "./permissions.js";
import { type SettingsService } from "./settingsService.js";
import { replyV2 } from "./messages.js";

export type SlashHandler = (ctx: SlashContext) => Promise<void> | void;

export interface SlashContext {
  interaction: ChatInputCommandInteraction<CacheType>;
  member: GuildMember;
  settings: GuildSettings;
  sub: SubCommand;
}

interface RegisterEntry {
  def: SubCommand;
  handler: SlashHandler;
  permission?: PermissionLevel;
}

export class CommandDispatcher {
  private readonly handlers = new Map<string, Map<string, RegisterEntry>>();

  constructor(private readonly settings: SettingsService) {}

  /** Command + Subcommand registrieren (z. B. aus einem Modul). */
  register(
    command: CommandDef,
    sub: SubCommand,
    handler: SlashHandler,
    permission?: PermissionLevel,
  ): void {
    const key = command.name;
    if (!this.handlers.has(key)) this.handlers.set(key, new Map());
    this.handlers.get(key)!.set(sub.name, { def: sub, handler, permission });
  }

  /** Route eine Slash-Interaction; liefert true wenn verarbeitet. */
  async route(interaction: ChatInputCommandInteraction<CacheType>): Promise<boolean> {
    const command = interaction.commandName;
    const sub = interaction.options.getSubcommand(false);
    if (!sub) return false;

    const entry = this.handlers.get(command)?.get(sub);
    if (!entry) return false;

    const member = interaction.member;
    if (!(member instanceof GuildMember)) {
      await replyV2(interaction, "Kein gültiger Server-Member.");
      return true;
    }

    const guild = interaction.guild;
    if (!guild) {
      await replyV2(interaction, "Dieser Befehl kann nur auf einem Server verwendet werden.");
      return true;
    }

    const settings = await this.settings.get(guild.id);

    const level: PermissionLevel =
      entry.permission ?? this.defLevel(interaction.commandName) ?? "public";
    if (!hasPermission(member, settings, level)) {
      await replyV2(interaction, permissionDenied(member));
      return true;
    }

    const ctx: SlashContext = {
      interaction,
      member,
      settings,
      sub: entry.def,
    };
    await entry.handler(ctx);
    return true;
  }

  private defLevel(name: string): PermissionLevel | undefined {
    const all = commands;
    return all.find((c) => c.name === name)?.permission;
  }
}
