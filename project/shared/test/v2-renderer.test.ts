import { MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";

import { container, layout, parseV2, row, section, serializeV2, text, validateLayout } from "../src/components/v2-layout.js";
import { V2MessageBuilder } from "../src/components/v2-renderer.js";

describe("v2-layout", () => {
  it("accepts a simple valid layout", () => {
    const l = layout([text("Hallo"), section([text("Berlin Roleplay")])]);
    expect(validateLayout(l).ok).toBe(true);
  });

  it("rejects too many top-level components", () => {
    const kids = Array.from({ length: 11 }, (_, i) => text(`Block ${i}`));
    const result = validateLayout(layout(kids));
    if (!result.ok) expect(result.errors.join(" ")).toContain("Top-Level");
  });

  it("rejects rows with more than five items", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ type: "button" as const, label: `B${i}`, style: "secondary" as const, customId: `b${i}` }));
    const result = validateLayout(layout([row(many)]));
    if (!result.ok) expect(result.errors.join(" ")).toContain("5 Komponenten");
  });

  it("round-trips a layout through the shared serializer", () => {
    const original = layout([text("Hallo"), row([{ type: "button", label: "OK", style: "success", customId: "ok" }])]);
    expect(parseV2(serializeV2(original))).toEqual(original);
  });
});

describe("v2-renderer", () => {
  it("builds a MessageCreateOptions with Components-V2 flags", () => {
    const builder = new V2MessageBuilder(layout([text("Hallo"), row([{ type: "button", label: "OK", style: "success", customId: "ok" }])]));
    const payload = builder.build();
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(Array.isArray(payload.components)).toBe(true);
  });

  it("builds an ephemeral variant with both flags", () => {
    const builder = new V2MessageBuilder(layout([text("Privat")]));
    const payload = builder.buildEphemeral();
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
  });

  it("throws on invalid layout", () => {
    const bad = layout([row([
      { type: "button", label: "Link ohne URL", style: "link" },
    ])]);
    expect(() => new V2MessageBuilder(bad).build()).toThrow(/Link-Buttons/);
  });

  it("renders containers with accent colors", () => {
    const l = layout([container([text("Inhalt")], "green")]);
    const builder = new V2MessageBuilder(l);
    expect(builder.build().components).toHaveLength(1);
  });
});