import { type MessageCreateOptions } from "discord.js";
import { V2MessageBuilder, type V2Layout } from "@berlin/shared";

// Per Spec §4: Alle gesendeten Nachrichten sind Components-V2-Nachrichten.
export class MessagesService {
  /** V2-Layout in ein sendbares Objekt umbauen (mit V2-Flag). */
  build(layout: V2Layout): MessageCreateOptions {
    return new V2MessageBuilder(layout).build();
  }

  buildEphemeral(layout: V2Layout): MessageCreateOptions {
    return new V2MessageBuilder(layout).buildEphemeral();
  }
}