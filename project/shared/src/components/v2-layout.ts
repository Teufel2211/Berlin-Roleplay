export type AccentColor = "brand" | "grey" | "red" | "green" | "yellow" | number;

export interface TextBlock {
  readonly type: "text";
  content: string;
  style?: "paragraph" | "heading" | "list_item" | "code";
}

export interface ThumbnailNode {
  readonly type: "thumbnail";
  url: string;
}

export interface SectionNode {
  readonly type: "section";
  title?: string;
  blocks: TextBlock[];
  accessory?: ThumbnailNode;
}

export interface ContainerNode {
  readonly type: "container";
  accentColor?: AccentColor;
  children: V2Node[];
}

export interface MediaGalleryItem {
  type: "image" | "video" | "file";
  url: string;
  description?: string;
  filename?: string;
}

export interface MediaGalleryNode {
  readonly type: "media";
  items: MediaGalleryItem[];
}

export interface SeparatorNode {
  readonly type: "separator";
  line?: boolean;
  spacing?: "small" | "large";
}

export interface FileNode {
  readonly type: "file";
  url: string;
  filename?: string;
}

export type ButtonStyle = "primary" | "secondary" | "success" | "danger" | "link";

export interface ButtonNode {
  readonly type: "button";
  label: string;
  style: ButtonStyle;
  customId?: string;
  url?: string;
  emoji?: string;
  disabled?: boolean;
}

export type SelectOption = {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  default?: boolean;
};

export type SelectKind = "user" | "role" | "mentionable" | "channel" | "string";

export interface SelectNode {
  readonly type: "select";
  kind: SelectKind;
  customId: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  options?: SelectOption[];
  channelTypes?: string[];
}

export type RowNode = {
  readonly type: "row";
  items: (ButtonNode | SelectNode)[];
};

export type V2Node =
  | TextBlock
  | SectionNode
  | ContainerNode
  | MediaGalleryNode
  | SeparatorNode
  | FileNode
  | RowNode;

export interface V2Layout {
  readonly version: 1;
  color?: number;
  children: V2Node[];
}

const MAX_TOTAL_COMPONENTS = 40;
const MAX_TOP_LEVEL_COMPONENTS = 10;
const MAX_CHARS = 4000;

function countNodes(nodes: readonly V2Node[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.type === "container") count += countNodes(node.children);
    else if (node.type === "row") count += node.items.length;
  }
  return count;
}

function countChars(nodes: readonly V2Node[]): number {
  let chars = 0;
  const add = (s?: string) => {
    if (s) chars += s.length;
  };
  for (const node of nodes) {
    add(JSON.stringify(node));
  }
  return chars;
}

/** Validates a V2Layout against Discord's Components V2 limits. */
export function validateLayout(layout: V2Layout): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const topLevel = layout.children.filter((n) => n.type !== "row" && n.type !== "container");
  if (topLevel.length > MAX_TOP_LEVEL_COMPONENTS) {
    errors.push(`Zu viele Top-Level-Komponenten: ${topLevel.length} (max ${MAX_TOP_LEVEL_COMPONENTS})`);
  }

  const total = countNodes(layout.children);
  if (total > MAX_TOTAL_COMPONENTS) {
    errors.push(`Zu viele Komponenten: ${total} (max ${MAX_TOTAL_COMPONENTS})`);
  }

  const chars = countChars(layout.children);
  if (chars > MAX_CHARS) {
    errors.push(`Zeichenbudget überschritten: ${chars} Zeichen (max ${MAX_CHARS})`);
  }

  for (const node of layout.children) {
    if (node.type === "row") {
      if (node.items.length > 5) {
        errors.push("Eine ActionRow darf maximal 5 Komponenten enthalten.");
      }
      for (const item of node.items) {
        if (item.type === "button" && item.style === "link" && !item.url) {
          errors.push("Link-Buttons benötigen eine URL.");
        }
        if (item.type === "button" && item.url && item.style !== "link") {
          errors.push("Nur Link-Buttons dürfen eine URL besitzen.");
        }
        if (item.type === "button" && !item.style) {
          errors.push("Buttons benötigen einen Stil.");
        }
        if (item.type === "button" && !item.customId && item.style !== "link") {
          errors.push("Nicht-Link-Buttons benötigen eine customId.");
        }
        if (item.type === "select" && item.kind === "string" && !item.options?.length) {
          errors.push("String-Selects benötigen Optionen.");
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

// ── Factory-Helfer ─────────────────────────────────────────────

export function text(content: string, opts: Partial<Pick<TextBlock, "style">> = {}): TextBlock {
  return { type: "text", content, ...opts };
}

export function section(
  blocks: TextBlock[],
  opts: Partial<Pick<SectionNode, "title" | "accessory">> = {},
): SectionNode {
  return { type: "section", blocks, ...opts };
}

export function container(children: V2Node[], accentColor?: AccentColor): ContainerNode {
  return { type: "container", accentColor, children };
}

export function separator(opts: Partial<Pick<SeparatorNode, "line" | "spacing">> = {}): SeparatorNode {
  return { type: "separator", ...opts };
}

export function media(items: MediaGalleryItem[]): MediaGalleryNode {
  return { type: "media", items };
}

export function file(url: string, filename?: string): FileNode {
  return { type: "file", url, filename };
}

export function button(label: string, style: ButtonStyle, opts: Partial<Omit<ButtonNode, "label" | "style">> = {}): ButtonNode {
  return { type: "button", label, style, ...opts };
}

export function select(kind: SelectKind, customId: string, opts: Partial<Omit<SelectNode, "type" | "kind" | "customId">> = {}): SelectNode {
  return { type: "select", kind, customId, ...opts };
}

export function row(items: (ButtonNode | SelectNode)[]): RowNode {
  return { type: "row", items };
}

export function layout(children: V2Node[], opts: Partial<Pick<V2Layout, "color">> = {}): V2Layout {
  return { version: 1, ...opts, children };
}