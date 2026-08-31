import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChannelSelectMenuBuilder,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MentionableSelectMenuBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
  UserSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions,
  type ModalActionRowComponentBuilder,
} from "discord.js";

import type {
  AccentColor,
  ButtonNode,
  ContainerNode,
  FileNode,
  MediaGalleryNode,
  RowNode,
  SectionNode,
  SelectNode,
  SeparatorNode,
  TextBlock,
  V2Layout,
  V2Node,
} from "./v2-layout.js";
import { validateLayout } from "./v2-layout.js";

const BUTTON_STYLE_MAP: Record<ButtonNode["style"], ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
  link: ButtonStyle.Link,
};

const CHANNEL_TYPE_MAP: Record<string, ChannelType | undefined> = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
  announcements: ChannelType.GuildAnnouncement,
  stage: ChannelType.GuildStageVoice,
};

/** Maps an accent color name/number to a Discord blurple-hex-derivable color. */
export function accentColorToDiscord(color?: AccentColor): number {
  if (color === undefined) return 5793266; // blurple default
  if (typeof color === "number") return color;
  switch (color) {
    case "grey":
      return 8359053;
    case "red":
      return 15548997;
    case "green":
      return 5763719;
    case "yellow":
      return 16705372;
    case "brand":
    default:
      return 5793266;
  }
}

/**
 * Discord API "message layout" top-level components. Used as the type for the
 * built `components` array so the compiler enforces that only valid top-level
 * V2 components leave this file.
 */
type TopLevelComponents = NonNullable<MessageCreateOptions["components"]>;
type TopLevelComponent = TopLevelComponents[number];

export class V2MessageBuilder {
  readonly layout: V2Layout;

  constructor(layout: V2Layout) {
    this.layout = layout;
  }

  build(): MessageCreateOptions {
    const validation = validateLayout(this.layout);
    if (!validation.ok) {
      throw new Error(`Invalid V2Layout: ${validation.errors.join("; ")}`);
    }

    const components = this.layout.children.map((node) => this.renderNode(node));
    return {
      flags: MessageFlags.IsComponentsV2,
      components,
    };
  }

  buildEphemeral(): MessageCreateOptions {
    const payload = this.build();
    return {
      ...payload,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    };
  }

  private renderNode(node: V2Node): TopLevelComponent {
    switch (node.type) {
      case "text":
        return new TextDisplayBuilder().setContent(node.content);
      case "section":
        return this.renderSection(node);
      case "container":
        return this.renderContainer(node);
      case "media":
        return this.renderMedia(node);
      case "separator": {
        const separatorBuilder = new SeparatorBuilder();
        if (node.line !== undefined) separatorBuilder.setDivider(node.line);
        if (node.spacing) separatorBuilder.setSpacing(node.spacing === "large" ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
        return separatorBuilder;
      }
      case "file":
        return this.renderFile(node);
      case "row":
        return this.renderRow(node);
    }
  }

  private renderSection(node: SectionNode): SectionBuilder {
    const sectionBuilder = new SectionBuilder();
    for (const block of node.blocks) {
      sectionBuilder.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.content));
    }
    if (node.accessory) sectionBuilder.setThumbnailAccessory(new ThumbnailBuilder().setURL(node.accessory.url));
    return sectionBuilder;
  }

  private renderContainer(node: ContainerNode): ContainerBuilder {
    const containerBuilder = new ContainerBuilder();
    if (node.accentColor !== undefined) containerBuilder.setAccentColor(accentColorToDiscord(node.accentColor));
    for (const child of node.children) {
      switch (child.type) {
        case "text":
          containerBuilder.addTextDisplayComponents(new TextDisplayBuilder().setContent(child.content));
          break;
        case "section":
          containerBuilder.addSectionComponents(this.renderSection(child));
          break;
        case "separator": {
          const separatorBuilder = new SeparatorBuilder();
          if (child.line !== undefined) separatorBuilder.setDivider(child.line);
          if (child.spacing) separatorBuilder.setSpacing(child.spacing === "large" ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
          containerBuilder.addSeparatorComponents(separatorBuilder);
          break;
        }
        case "media":
          containerBuilder.addMediaGalleryComponents(this.renderMedia(child));
          break;
        case "file":
          containerBuilder.addFileComponents(this.renderFile(child));
          break;
        case "row":
          containerBuilder.addActionRowComponents(this.renderRow(child));
          break;
        case "container":
          throw new Error("V2Layout: Container kann nicht in einem Container verschachtelt werden.");
      }
    }
    return containerBuilder;
  }

  private renderMedia(node: MediaGalleryNode): MediaGalleryBuilder {
    const gallery = new MediaGalleryBuilder();
    const items = node.items.map((item) => {
      const built = new MediaGalleryItemBuilder().setURL(item.url);
      if (item.description) built.setDescription(item.description);
      return built;
    });
    gallery.addItems(...items);
    return gallery;
  }

  private renderFile(node: FileNode): FileBuilder {
    return new FileBuilder().setURL(node.url);
  }

  private renderButton(node: ButtonNode): ButtonBuilder {
    const builder = new ButtonBuilder()
      .setStyle(BUTTON_STYLE_MAP[node.style])
      .setLabel(node.label);
    if (node.customId) builder.setCustomId(node.customId);
    if (node.url) builder.setURL(node.url);
    if (node.emoji) builder.setEmoji(node.emoji);
    if (node.disabled) builder.setDisabled(true);
    return builder;
  }

  private renderSelect(node: SelectNode) {
    switch (node.kind) {
      case "user":
        return new UserSelectMenuBuilder().setCustomId(node.customId).setPlaceholder(node.placeholder ?? "Wähle Benutzer…");
      case "role":
        return new RoleSelectMenuBuilder().setCustomId(node.customId).setPlaceholder(node.placeholder ?? "Wähle Rollen…");
      case "mentionable":
        return new MentionableSelectMenuBuilder().setCustomId(node.customId).setPlaceholder(node.placeholder ?? "Wähle…");
      case "channel": {
        const builder = new ChannelSelectMenuBuilder().setCustomId(node.customId).setPlaceholder(node.placeholder ?? "Wähle Kanal…");
        if (node.channelTypes?.length) {
          const types = node.channelTypes.map((t) => CHANNEL_TYPE_MAP[t]).filter((t): t is ChannelType => t !== undefined);
          builder.addChannelTypes(...types);
        }
        return builder;
      }
      case "string": {
        const builder = new StringSelectMenuBuilder().setCustomId(node.customId).setPlaceholder(node.placeholder ?? "Wähle…");
        if (node.options) {
          builder.addOptions(node.options.map((o) => ({ label: o.label, value: o.value, description: o.description, emoji: o.emoji, default: o.default })));
        }
        if (node.minValues !== undefined) builder.setMinValues(node.minValues);
        if (node.maxValues !== undefined) builder.setMaxValues(node.maxValues);
        return builder;
      }
    }
  }

  private renderRow(node: RowNode) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const item of node.items) {
      row.addComponents(item.type === "button" ? this.renderButton(item) : this.renderSelect(item));
    }
    return row;
  }
}

/** Builds a modal from pre-bound text-input definitions. */
export function buildModal(
  customId: string,
  title: string,
  fields: { customId: string; label: string; value?: string; required?: boolean; minLength?: number; maxLength?: number }[],
): { customId: string; title: string; components: ActionRowBuilder<ModalActionRowComponentBuilder>[] } {
  const row = new ActionRowBuilder<ModalActionRowComponentBuilder>();
  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.customId)
      .setLabel(field.label)
      .setStyle(TextInputStyle.Short)
      .setRequired(field.required ?? true)
      .setMinLength(field.minLength ?? 1)
      .setMaxLength(field.maxLength ?? 1000);
    if (field.value) input.setValue(field.value);
    row.addComponents(input);
  }
  return { customId, title, components: [row] };
}