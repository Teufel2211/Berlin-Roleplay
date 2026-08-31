import { type Client, type ClientEvents } from "discord.js";

export type EventName = keyof ClientEvents;

export type EventHandler<K extends EventName = EventName> = (...args: ClientEvents[K]) => void | Promise<void>;

/** Event-Router: Module registrieren Handler pro discord.js-Event. */
export class EventRouter {
  readonly #handlers = new Map<EventName, EventHandler[]>();

  on<K extends EventName>(event: K, handler: EventHandler<K>): void {
    let list = this.#handlers.get(event);
    if (!list) {
      list = [];
      this.#handlers.set(event, list);
    }
    list.push(handler as EventHandler);
  }

  /** Alle Handler des Routers an den Client hängen. */
  attach(client: Client): void {
    for (const [event, handlers] of this.#handlers) {
      client.on(event, (...args) => {
        for (const handler of handlers) {
          Promise.resolve(handler(...args)).catch((err) => {
            client.emit("error", new Error(`Event-Handler ${event} fehlgeschlagen: ${String(err)}`));
          });
        }
      });
    }
  }
}