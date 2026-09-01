"use client";

import { useActionState, useMemo, useState } from "react";
import { saveComponentTemplate, deleteComponentTemplate, type ActionResult } from "@/app/dashboard/[guildId]/actions";
import type { ComponentTemplateRow } from "@/lib/queries";
import { renderV2Preview, type V2PreviewSegment } from "@berlin/shared/preview";
import type { V2Layout } from "@berlin/shared/layout";

const SAMPLE_LAYOUT: V2Layout = {
  version: 1,
  color: 0x1f2937,
  children: [
    { type: "text", content: "Willkommen im Berlin Roleplay Dashboard", style: "heading" },
    {
      type: "section",
      title: "Serverstatus",
      blocks: [{ type: "text", content: "Alle Module laufen stabil und sind bereit." }],
    },
    {
      type: "row",
      items: [
        { type: "button", label: "Tickets", style: "primary", customId: "tickets" },
        { type: "button", label: "Giveaways", style: "secondary", customId: "giveaways" },
      ],
    },
  ],
};

const initialJson = JSON.stringify(SAMPLE_LAYOUT, null, 2);

export function ComponentEditor({
  guildId,
  template,
}: {
  guildId: string;
  template?: ComponentTemplateRow | null;
}) {
  const [name, setName] = useState(template?.name ?? "welcome-template");
  const [description, setDescription] = useState(template?.description ?? "Willkommens-Layout mit Status- und CTA-Elementen.");
  const [payload, setPayload] = useState<string>(template ? JSON.stringify(template.payload, null, 2) : initialJson);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(saveComponentTemplate, null);
  const [deleteState, deleteAction] = useActionState<ActionResult | null, FormData>(deleteComponentTemplate, null);

  const preview = useMemo(() => {
    try {
      const layout = JSON.parse(payload) as V2Layout;
      const result = renderV2Preview(layout);
      return result.ok ? result.segments : result.errors;
    } catch {
      return ["Ungültiges JSON – bitte Korrektur prüfen."];
    }
  }, [payload]);

  const vanillaPayload = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(payload || "{}"), null, 2);
    } catch {
      return payload || "{}";
    }
  }, [payload]);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="templateId" value={template?.id ?? ""} />
        <input type="hidden" name="payload" value={vanillaPayload} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              name="name"
              className="w-full rounded-lg border border-[--border] bg-[--bg-primary] px-3 py-2 text-sm text-[--text-primary]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Beschreibung</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              name="description"
              className="w-full rounded-lg border border-[--border] bg-[--bg-primary] px-3 py-2 text-sm text-[--text-primary]"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Layout-JSON</span>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={18}
            spellCheck={false}
            className="w-full rounded-xl border border-[--border] bg-[--bg-primary] p-3 font-mono text-xs text-[--text-primary]"
          />
        </label>

        {(state && !state.ok) || (state && state.ok) ? (
          <div className={state?.ok ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500" : "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500"}>
            {state?.ok ? state.message : state?.error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded-lg bg-[--accent] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[--accent-hover]"
          >
            {template ? "Änderungen speichern" : "Template erstellen"}
          </button>
          {template ? (
            <button
              type="submit"
              formAction={deleteAction}
              className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-500 transition hover:bg-red-500/10"
            >
              Löschen
            </button>
          ) : null}
        </div>
      </form>

      {deleteState && !deleteState.ok ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {deleteState.error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-[--border] bg-[--bg-secondary] p-4">
        <h3 className="mb-3 text-lg font-semibold">Live-Vorschau</h3>
        {Array.isArray(preview) && preview.length > 0 ? (
          <div className="space-y-2">
            {preview.map((segment, index) => (
              <div key={index} className="rounded-lg border border-[--border] bg-[--bg-primary] p-3 text-sm text-[--text-muted]">
                {typeof segment === "string" ? segment : JSON.stringify(segment)}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[--text-muted]">Vorschau wird hier geladen…</div>
        )}
      </div>
    </div>
  );
}
