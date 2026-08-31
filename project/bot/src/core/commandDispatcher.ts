import { ChatInputCommandInteraction, GuildMember, type CacheType } from "discord.js";
import { V2MessageBuilder, type CommandDef, type SubCommand, type GuildSettings, type V2Layout, commands } from "@berlin/shared";
import { hasPermission, type PermissionLevel } from "./permissions.js";
import { type SettingsService } from "./settingsService.js";

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

function v2Text(content: string): V2Layout {
  return { version: 1, children: [{ type: "text", content, style: "paragraph" }] };
}

export class CommandDispatcher {
  private readonly handlers = new Map<string, Map<string, RegisterEntry>>();

  constructor(private readonly settings: SettingsService) {}

  register(command: CommandDef, sub: SubCommand, handler: SlashHandler, permission?: PermissionLevel): void {
    const key = command.name;
    if (!this.handlers.has(key)) this.handlers.set(key, new Map());
    this.handlers.get(key)!.set(sub.name, { def: sub, handler, permission });
  }

  async route(interaction: ChatInputCommandInteraction<CacheType>): Promise<boolean> {
    const command = interaction.commandName;
    const sub = interaction.options.getSubcommand(false);
    if (!sub) return false;

    const entry = this.handlers.get(command)?.get(sub);
    if (!entry) return false;

    const member = interaction.member;
    if (!(member instanceof GuildMember)) {
      await interaction.reply(new V2MessageBuilder(v2Text("Kein gültiger Server-Member.")).buildEphemeral());
      return true;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(new V2MessageBuilder(v2Text("Dieser Befehl kann nur auf einem Server verwendet werden.")).buildEphemeral());
      return true;
    }

    const settings = await this.settings.get(guild.id);
    const commandDef = commands.find((c) => c.name === command);
    const level: PermissionLevel = entry.permission ?? entry.def.permission ?? commandDef?.permission ?? "public";

    if (!hasPermission(member, settings, level)) {
      await interaction.reply(new V2MessageBuilder(v2Text(`Du hast keine Berechtigung für diese Aktion, ${member.user.username}.`)).buildEphemeral());
      return true;
    }

    await entry.handler({ interaction, member, settings, sub: entry.def });
    return true;
  }
}
