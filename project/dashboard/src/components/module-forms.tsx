"use client";

import { useActionState } from "react";
import {
  saveWelcomeConfig,
  saveVerificationConfig,
  createERLCServer,
  changeERLCServer,
  changeTicketStatus,
  createGiveaway,
  changeGiveawayStatus,
  type ActionResult,
} from "@/app/dashboard/[guildId]/actions";
import type { WelcomeConfig, VerificationConfig, ERLCServerRow, TicketRow, GiveawayRow } from "@/lib/queries";
import { Panel } from "@/components/ui";

const inputCls =
  "w-full rounded-lg border border-[--border] bg-[--bg-primary] px-3 py-2 text-sm text-[--text-primary] placeholder-[--text-secondary] focus:outline-none focus:border-[--accent]";
const checkCls =
  "h-4 w-4 rounded border-[--border] bg-[--bg-primary] accent-[--accent]";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[--text-secondary]">{hint}</span> : null}
    </label>
  );
}

function Submit({ value }: { value: string }) {
  return (
    <button
      type="submit"
      className="rounded-lg bg-[--accent] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[--accent-hover]"
    >
      {value}
    </button>
  );
}

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-sm text-emerald-500">
        {state.message ?? "Gespeichert."}
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-500">
      {state.error}
    </p>
  );
}

export function WelcomeForm({
  guildId,
  config,
}: {
  guildId: string;
  config?: WelcomeConfig | null;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveWelcomeConfig,
    null
  );

  return (
    <Panel>
      <h2 className="text-lg font-semibold mb-4">Konfiguration bearbeiten</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="guildId" value={guildId} />
        <label className="flex items-center gap-3">
          <input type="checkbox" name="enabled" defaultChecked={config?.enabled ?? true} className={checkCls} />
          <span className="text-sm font-medium">Modul aktivieren</span>
        </label>
        <Field label="Kanal-ID">
          <input type="text" name="channel_id" defaultValue={config?.channel_id ?? ""} placeholder="z. B. 120000000000000000" className={inputCls} />
        </Field>
        <Field label="Rolle-ID">
          <input type="text" name="role_id" defaultValue={config?.role_id ?? ""} placeholder="z. B. 120000000000000001" className={inputCls} />
        </Field>
        <Field label="Nachrichten-Text" hint="Platzhalter: {user} für den Usernamen.">
          <textarea name="message_template" defaultValue={config?.message_template ?? ""} rows={4} className={inputCls} />
        </Field>
        <Feedback state={state} />
        <Submit value="Speichern" />
      </form>
    </Panel>
  );
}

export function VerifyForm({
  guildId,
  config,
}: {
  guildId: string;
  config?: VerificationConfig | null;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveVerificationConfig,
    null
  );

  return (
    <Panel>
      <h2 className="text-lg font-semibold mb-4">Konfiguration bearbeiten</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="guildId" value={guildId} />
        <label className="flex items-center gap-3">
          <input type="checkbox" name="enabled" defaultChecked={config?.enabled ?? true} className={checkCls} />
          <span className="text-sm font-medium">Modul aktivieren</span>
        </label>
        <Field label="Methode">
          <select name="method" defaultValue={config?.method ?? "button"} className={inputCls}>
            <option value="button">Button</option>
            <option value="snowflake">Snowflake</option>
          </select>
        </Field>
        <Field label="Kanal-ID">
          <input type="text" name="channel_id" defaultValue={config?.channel_id ?? ""} placeholder="z. B. 120000000000000000" className={inputCls} />
        </Field>
        <Field label="Rolle-ID">
          <input type="text" name="role_id" defaultValue={config?.role_id ?? ""} placeholder="z. B. 120000000000000001" className={inputCls} />
        </Field>
        <label className="flex items-center gap-3">
          <input type="checkbox" name="restore_on_unverify" defaultChecked={config?.restore_on_unverify ?? false} className={checkCls} />
          <span className="text-sm font-medium">Rollen bei Unverify wiederherstellen</span>
        </label>
        <Feedback state={state} />
        <Submit value="Speichern" />
      </form>
    </Panel>
  );
}

export function ERLCRegisterForm({ guildId }: { guildId: string }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    createERLCServer,
    null
  );

  return (
    <Panel>
      <h2 className="text-lg font-semibold mb-4">Server verbinden</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="guildId" value={guildId} />
        <Field label="Name">
          <input type="text" name="name" required placeholder="z. B. Berlin1" className={inputCls} />
        </Field>
        <Field label="Base URL" hint="API-Key wird hier nicht gesetzt (verschlüsselt/Env).">
          <input type="text" name="base_url" defaultValue="https://api.erlc.gg/v2" className={inputCls} />
        </Field>
        <Feedback state={state} />
        <Submit value="Server hinzufügen" />
      </form>
    </Panel>
  );
}

export function ERLCServerActions({
  guildId,
  server,
}: {
  guildId: string;
  server: ERLCServerRow;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    changeERLCServer,
    null
  );

  return (
    <div className="mt-3">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="serverId" value={server.id} />
        <button
          type="submit"
          name="action"
          value="toggle"
          className="rounded-lg border border-[--border] px-3 py-1.5 text-xs font-medium transition hover:bg-[--bg-card-hover]"
        >
          {server.enabled ? "Deaktivieren" : "Aktivieren"}
        </button>
        <button
          type="submit"
          name="action"
          value="delete"
          className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/10"
        >
          Löschen
        </button>
      </form>
      {state && !state.ok ? (
        <p className="mt-2 text-xs text-red-500">{state.error}</p>
      ) : null}
    </div>
  );
}

export function TicketActions({
  guildId,
  ticket,
}: {
  guildId: string;
  ticket: TicketRow;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    changeTicketStatus,
    null
  );

  const actions: { value: string; label: string }[] =
    ticket.status === "open"
      ? [
          { value: "claim", label: "Claimen" },
          { value: "close", label: "Schließen" },
        ]
      : ticket.status === "claimed"
        ? [
            { value: "unclaim", label: "Unclaimen" },
            { value: "close", label: "Schließen" },
          ]
        : [{ value: "reopen", label: "Wieder öffnen" }];

  return (
    <div>
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="ticketId" value={ticket.id} />
        {actions.map((a) => (
          <button
            key={a.value}
            type="submit"
            name="action"
            value={a.value}
            className="rounded-lg border border-[--border] px-3 py-1.5 text-xs font-medium transition hover:bg-[--bg-card-hover]"
          >
            {a.label}
          </button>
        ))}
      </form>
      {state && !state.ok ? (
        <p className="mt-2 text-xs text-red-500">{state.error}</p>
      ) : null}
    </div>
  );
}

export function GiveawayCreateForm({ guildId }: { guildId: string }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    createGiveaway,
    null
  );

  return (
    <Panel>
      <h2 className="text-lg font-semibold mb-4">Giveaway erstellen</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="guildId" value={guildId} />
        <Field label="Preis">
          <input type="text" name="prize" required placeholder="z. B. 100k Euro" className={inputCls} />
        </Field>
        <Field label="Kanal-ID">
          <input type="text" name="channel_id" required placeholder="z. B. 120000000000000000" className={inputCls} />
        </Field>
        <Field label="Gewinner">
          <input type="number" name="winners_count" min={1} defaultValue={1} className={inputCls} />
        </Field>
        <Field label="Endzeit">
          <input type="datetime-local" name="end_at" required className={inputCls} />
        </Field>
        <Feedback state={state} />
        <Submit value="Giveaway erstellen" />
      </form>
    </Panel>
  );
}

export function GiveawayActions({
  guildId,
  giveaway,
}: {
  guildId: string;
  giveaway: GiveawayRow;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    changeGiveawayStatus,
    null
  );

  if (giveaway.status !== "running") return null;

  return (
    <div className="mt-3">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="giveawayId" value={giveaway.id} />
        <button
          type="submit"
          name="action"
          value="end"
          className="rounded-lg border border-[--border] px-3 py-1.5 text-xs font-medium transition hover:bg-[--bg-card-hover]"
        >
          Beenden
        </button>
        <button
          type="submit"
          name="action"
          value="cancel"
          className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/10"
        >
          Abbrechen
        </button>
      </form>
      {state && !state.ok ? (
        <p className="mt-2 text-xs text-red-500">{state.error}</p>
      ) : null}
    </div>
  );
}
