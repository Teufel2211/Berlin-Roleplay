import { type Client } from "discord.js";
import { commands, type CommandDef } from "@berlin/shared";
import { type EventRouter } from "./eventRouter.js";
import { type InteractionRouter } from "./interactions/router.js";
import { type CommandDispatcher } from "./commandDispatcher.js";

export interface BotModule {
  name: string;
  /** Extra (modulspezifische) Slash-Commands neben dem Shared-Schema. */
  commands?: CommandDef[];
  /** Event-Handler registrieren. */
  register?(
    ctx: {
      eventRouter: EventRouter;
      interactionRouter: InteractionRouter;
      commands: CommandDispatcher;
      client: Client;
    },
  ): void | Promise<void>;
}

/**
 * Registry: sammelt Module, bündelt Commands aus Schema + Moduln,
 * verdrahtet EventRouter + InteractionRouter.
 */
export class Registry {
  readonly #modules: BotModule[] = [];
  readonly #eventRouter: EventRouter;
  readonly #interactionRouter: InteractionRouter;
  readonly #commandDispatcher: CommandDispatcher;
  readonly #client: Client;

  constructor(
    client: Client,
    eventRouter: EventRouter,
    interactionRouter: InteractionRouter,
    commandDispatcher: CommandDispatcher,
  ) {
    this.#client = client;
    this.#eventRouter = eventRouter;
    this.#interactionRouter = interactionRouter;
    this.#commandDispatcher = commandDispatcher;
  }

  add(module: BotModule): void {
    this.#modules.push(module);
  }

  /** Alle Slash-Command-Defs (Shared-Schema + Modul-Defs). */
  allCommands(): CommandDef[] {
    const defs: CommandDef[] = [...commands];
    for (const mod of this.#modules) {
      if (mod.commands) defs.push(...mod.commands);
    }
    return defs;
  }

  /** Module initialisieren → Handler registrieren. */
  async init(): Promise<void> {
    for (const mod of this.#modules) {
      await mod.register?.({
        eventRouter: this.#eventRouter,
        interactionRouter: this.#interactionRouter,
        commands: this.#commandDispatcher,
        client: this.#client,
      });
    }
    this.#eventRouter.attach(this.#client);
  }
}