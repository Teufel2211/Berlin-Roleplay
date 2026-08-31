import {
  type APIApplicationCommandBasicOption,
  type APIApplicationCommandOption,
  type APIApplicationCommandSubcommandOption,
} from "discord-api-types/v10";
import { REST, Routes, type RESTPutAPIApplicationCommandsJSONBody } from "discord.js";
import { commands, type CommandDef, type CommandOption, type SubCommand } from "@berlin/shared";
import type { Logger } from "../logger.js";

/**
 * Command-Deployment: Schema → Discord-REST-Payload (guild-scoped + optional global).
 * Permission-Mapping (public/staff/admin) über default_member_permissions;
 * feingranulare Role-Checks erfolgen im Interaction-Handler.
 */
export class CommandDeployer {
  readonly #rest: REST;
  readonly #clientId: string;
  readonly #guildId: string | null;
  readonly #logger: Logger;

  constructor(clientId: string, token: string, guildId: string | null, logger: Logger) {
    this.#rest = new REST({ version: "10" });
    this.#rest.setToken(token);
    this.#clientId = clientId;
    this.#guildId = guildId;
    this.#logger = logger;
  }

  /** Alle Commands aus dem Shared-Schema + Modul-Defs deployen. */
  async deploy(defs: CommandDef[]): Promise<void> {
    const payload = defs.map(toApiCommand) as RESTPutAPIApplicationCommandsJSONBody;

    try {
      if (this.#guildId) {
        await this.#rest.put(Routes.applicationGuildCommands(this.#clientId, this.#guildId), {
          body: payload,
        });
        this.#logger.info(`Slash-Commands deployed in Guild ${this.#guildId} (${payload.length} Befehle)`);
      } else {
        await this.#rest.put(Routes.applicationCommands(this.#clientId), { body: payload });
        this.#logger.info(`Slash-Commands global deployed (${payload.length} Befehle)`);
      }
    } catch (err) {
      this.#logger.error(`Command-Deployment fehlgeschlagen: ${String(err)}`);
      throw err;
    }
  }
}

interface ApiCommandShape {
  name: string;
  description: string;
  options?: APIApplicationCommandOption[];
  default_member_permissions?: string;
}

/** CommandDef → Discord-API-Payload. */
export function toApiCommand(cmd: CommandDef): ApiCommandShape {
  let options: APIApplicationCommandOption[] | undefined;
  if (cmd.subCommands) {
    options = cmd.subCommands.map(toApiSubCommand);
  } else if (cmd.options) {
    options = cmd.options.map(toApiOption);
  }

  return {
    name: cmd.name,
    description: cmd.description,
    options,
    default_member_permissions: defaultPermissions(cmd.permission),
  };
}

function toApiSubCommand(sub: SubCommand): APIApplicationCommandSubcommandOption {
  return {
    type: 1,
    name: sub.name,
    description: sub.description,
    options: sub.options?.map(toApiOption),
  };
}

function toApiOption(opt: CommandOption): APIApplicationCommandBasicOption {
  switch (opt.type) {
    case "string":
      return { type: 3, name: opt.name, description: opt.description, required: opt.required ?? false, choices: opt.choices?.map((c) => ({ name: c.name, value: c.value })) };
    case "channel":
      return { type: 7, name: opt.name, description: opt.description, required: opt.required ?? false };
    case "role":
      return { type: 8, name: opt.name, description: opt.description, required: opt.required ?? false };
    case "user":
      return { type: 6, name: opt.name, description: opt.description, required: opt.required ?? false };
    case "integer":
      return { type: 4, name: opt.name, description: opt.description, required: opt.required ?? false, min_value: opt.min, max_value: opt.max };
    case "boolean":
      return { type: 5, name: opt.name, description: opt.description, required: opt.required ?? false };
  }
}

/** default_member_permissions als Bitfield-String; public = kein Bit gesetzt. */
function defaultPermissions(permission: CommandDef["permission"]): string | undefined {
  switch (permission) {
    case "staff":
      return undefined; // Nutzer-sichtbar; Role-Check im Handler
    case "admin":
      return (1n << 3n).toString(); // Administrator als Standard-Schwelle
    default:
      return "0";
  }
}

export { commands };