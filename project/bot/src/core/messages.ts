import { MessageFlags, type InteractionReplyOptions, type MessageCreateOptions } from "discord.js";
import type { RepliableInteraction } from "discord.js";
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

export function textLayout(text: string): V2Layout {
  return {
    version: 1,
    children: [{ type: "text", content: text, style: "paragraph" }],
  };
}

export function v2Text(text: string, ephemeral = true): InteractionReplyOptions {
  return v2LayoutReply(textLayout(text), ephemeral);
}

export function v2LayoutReply(layout: V2Layout, ephemeral = true): InteractionReplyOptions {
  const payload = new V2MessageBuilder(layout).build();
  return {
    components: payload.components,
    flags: ephemeral
      ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      : MessageFlags.IsComponentsV2,
  };
}

export async function replyV2(
  interaction: Pick<RepliableInteraction, "reply">,
  text: string,
  ephemeral = true,
): Promise<unknown> {
  return interaction.reply(v2Text(text, ephemeral));
}
