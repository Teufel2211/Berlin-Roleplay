import type { ButtonNode, SelectNode, V2Layout, V2Node } from "./v2-layout.js";

/** A render-agnostic preview segment the dashboard can paint without Discord. */
export type V2PreviewSegment =
  | { kind: "text"; content: string; style: "paragraph" | "heading" | "list_item" | "code" }
  | { kind: "section"; title?: string; blocks: string[]; accessoryUrl?: string }
  | { kind: "container"; accentColor?: number; segments: V2PreviewSegment[] }
  | { kind: "media"; items: { url: string; description?: string; filename?: string }[] }
  | { kind: "divider"; line: boolean }
  | { kind: "file"; url: string; filename?: string }
  | { kind: "row"; items: PreviewRowItem[] };

export type PreviewRowItem =
  | { kind: "button"; label: string; style: string; disabled: boolean; link?: string }
  | { kind: "select"; label: string; options: number };

export type V2PreviewResult =
  | { ok: true; segments: V2PreviewSegment[] }
  | { ok: false; errors: string[] };

export function renderV2Preview(layout: V2Layout): V2PreviewResult {
  const errors = validateLayoutErrors(layout);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, segments: layout.children.map(renderNodePreview) };
}

export function renderPreviewText(layout: V2Layout): string {
  const preview = renderV2Preview(layout);
  if (!preview.ok) return `[Ungültiges Layout: ${preview.errors.join("; ")}]`;
  const lines: string[] = [];
  for (const segment of preview.segments) segmentToText(segment, 0, lines);
  return lines.join("\n");
}

function validateLayoutErrors(layout: V2Layout): string[] {
  const errors: string[] = [];
  const count = (nodes: readonly V2Node[]): number => {
    let total = 0;
    for (const n of nodes) {
      total += 1;
      if (n.type === "container") total += count(n.children);
      else if (n.type === "row") total += n.items.length;
    }
    return total;
  };
  const chars = (nodes: readonly V2Node[]): number => {
    let total = 0;
    for (const n of nodes) total += JSON.stringify(n).length;
    return total;
  };
  if (layout.children.length > 10) errors.push("Zu viele Top-Level-Komponenten (max 10).");
  if (count(layout.children) > 40) errors.push("Zu viele Komponenten (max 40).");
  if (chars(layout.children) > 4000) errors.push("Zeichenbudget überschritten (max 4000).");
  for (const node of layout.children) {
    if (node.type === "row") {
      if (node.items.length > 5) errors.push("Eine ActionRow darf maximal 5 Komponenten enthalten.");
      for (const item of node.items) {
        if (item.type === "button" && item.style === "link" && !item.url) errors.push("Link-Buttons benötigen eine URL.");
        if (item.type === "button" && item.url && item.style !== "link") errors.push("Nur Link-Buttons dürfen eine URL besitzen.");
        if (item.type === "button" && !item.customId && item.style !== "link") errors.push("Nicht-Link-Buttons benötigen eine customId.");
        if (item.type === "select" && item.kind === "string" && !item.options?.length) errors.push("String-Selects benötigen Optionen.");
      }
    }
  }
  return errors;
}

function segmentToText(segment: V2PreviewSegment, depth: number, out: string[]): void {
  const pad = "  ".repeat(depth);
  switch (segment.kind) {
    case "text":
      out.push(`${pad}${segment.content}`);
      break;
    case "section":
      if (segment.title) out.push(`${pad}## ${segment.title}`);
      for (const b of segment.blocks) out.push(`${pad}${b}`);
      if (segment.accessoryUrl) out.push(`${pad}[Bild: ${segment.accessoryUrl}]`);
      break;
    case "container":
      out.push(`\u250c Container${segment.accentColor !== undefined ? ` (#${segment.accentColor.toString(16).padStart(6, "0")})` : ""}`);
      for (const s of segment.segments) segmentToText(s, depth + 1, out);
      out.push("\u2514 /Container");
      break;
    case "media":
      for (const item of segment.items) {
        out.push(`${pad}[${item.filename ?? item.url}]${item.description ? ` - ${item.description}` : ""}`);
      }
      break;
    case "divider":
      if (segment.line) out.push(`${pad}\u2500`.repeat(24));
      break;
    case "file":
      out.push(`${pad}[Datei: ${segment.filename ?? segment.url}]`);
      break;
    case "row":
      out.push(`${pad}${segment.items.map((i) => (i.kind === "button" ? `[${i.label}]` : `[\u25BC ${i.options} Optionen]`)).join(" ")}`);
      break;
  }
}

function renderNodePreview(node: V2Node): V2PreviewSegment {
  switch (node.type) {
    case "text":
      return { kind: "text", content: node.content, style: node.style ?? "paragraph" };
    case "section":
      return {
        kind: "section",
        title: node.title,
        blocks: node.blocks.map((b) => b.content),
        accessoryUrl: node.accessory?.url,
      };
    case "container":
      return {
        kind: "container",
        accentColor: typeof node.accentColor === "number" ? node.accentColor : undefined,
        segments: node.children.map(renderNodePreview),
      };
    case "media":
      return {
        kind: "media",
        items: node.items.map((i) => ({ url: i.url, description: i.description, filename: i.filename })),
      };
    case "separator":
      return { kind: "divider", line: node.line ?? false };
    case "file":
      return { kind: "file", url: node.url, filename: node.filename };
    case "row":
      return { kind: "row", items: node.items.map((i) => renderRowItemPreview(i)) };
  }
}

function renderRowItemPreview(item: ButtonNode | SelectNode): PreviewRowItem {
  if (item.type === "button") {
    return { kind: "button", label: item.label, style: item.style, disabled: item.disabled ?? false, link: item.url };
  }
  return { kind: "select", label: item.placeholder ?? "Wähle…", options: item.options?.length ?? 0 };
}