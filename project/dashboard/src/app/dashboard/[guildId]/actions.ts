"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseV2 } from "@berlin/shared/layout";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireGuild } from "@/lib/guild";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/**
 * Admin-Gate: der eingeloggte User muss in der Guild die Rolle "admin" haben.
 * Nicht-Mitglied -> notFound, Non-Admin -> redirect auf Guild-Start.
 */
async function requireAdmin(guildId: string) {
  await requireAuth();
  const guild = await requireGuild(guildId);
  if (guild.role !== "admin") redirect(`/dashboard/${guildId}`);
  return guild;
}

function fail(e: unknown): ActionResult {
  return {
    ok: false,
    error: e instanceof Error ? e.message : "Unbekannter Fehler",
  };
}

export async function saveGuildSettings(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    await requireAdmin(guildId);
    const raw = String(formData.get("settings") ?? "").trim();
    if (!raw) return { ok: false, error: "Settings-JSON ist leer." };

    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "Settings-JSON ist ungültig." };
    }

    const { error } = await getSupabaseAdmin()
      .from("berlin_roleplay_guilds")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", guildId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/${guildId}/settings`);
    revalidatePath(`/dashboard/${guildId}`);
    return { ok: true, message: "Settings gespeichert." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveWelcomeConfig(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    const guild = await requireAdmin(guildId);
    const enabled = formData.get("enabled") === "on";
    const channel_id = (formData.get("channel_id") as string | null)?.trim() || null;
    const role_id = (formData.get("role_id") as string | null)?.trim() || null;
    const message_template = (formData.get("message_template") as string | null) ?? "";

    const { error } = await getSupabaseAdmin()
      .from("berlin_roleplay_welcome_config")
      .upsert(
        {
          guild_id: guild.guildId,
          enabled,
          channel_id,
          role_id,
          message_template,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guild_id" }
      );
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/${guildId}/welcome`);
    return { ok: true, message: "Welcome-Konfiguration gespeichert." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveVerificationConfig(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    const guild = await requireAdmin(guildId);
    const enabled = formData.get("enabled") === "on";
    const channel_id = (formData.get("channel_id") as string | null)?.trim() || null;
    const role_id = (formData.get("role_id") as string | null)?.trim() || null;
    const method = formData.get("method") === "snowflake" ? "snowflake" : "button";
    const restore_on_unverify = formData.get("restore_on_unverify") === "on";

    const { error } = await getSupabaseAdmin()
      .from("berlin_roleplay_verification_config")
      .upsert(
        {
          guild_id: guild.guildId,
          enabled,
          channel_id,
          role_id,
          method,
          restore_on_unverify,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guild_id" }
      );
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/${guildId}/verify`);
    return { ok: true, message: "Verify-Konfiguration gespeichert." };
  } catch (e) {
    return fail(e);
  }
}

export async function createERLCServer(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    const guild = await requireAdmin(guildId);
    const name = (formData.get("name") as string | null)?.trim() || "";
    if (!name) return { ok: false, error: "Name ist erforderlich" };
    const base_url =
      (formData.get("base_url") as string | null)?.trim() ||
      "https://api.erlc.gg/v2";

    const { error } = await getSupabaseAdmin()
      .from("berlin_roleplay_erlc_servers")
      .insert({
        guild_id: guild.guildId,
        name,
        base_url,
        api_key_enc: "",
        enabled: true,
      });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/${guildId}/erlc`);
    return { ok: true, message: "ER:LC-Server hinzugefügt." };
  } catch (e) {
    return fail(e);
  }
}

function parseV2Layout(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Payload ist erforderlich.");
  return parseV2(raw);
}

export async function saveComponentTemplate(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    const guild = await requireAdmin(guildId);
    const user = await requireAuth();

    const templateId = String(formData.get("templateId") ?? "").trim();
    const name = (formData.get("name") as string | null)?.trim() || "";
    const description = (formData.get("description") as string | null)?.trim() || "";
    const payload = parseV2Layout(formData.get("payload"));

    if (!name) return { ok: false, error: "Name ist erforderlich." };

    const now = new Date().toISOString();

    if (templateId) {
      const { data: current, error: readError } = await getSupabaseAdmin()
        .from("berlin_roleplay_component_templates")
        .select("version")
        .eq("id", templateId)
        .eq("guild_id", guild.guildId)
        .maybeSingle();

      if (readError || !current) {
        return { ok: false, error: "Template nicht gefunden." };
      }

      const nextVersion = Number(current.version ?? 1) + 1;
      const { error } = await getSupabaseAdmin()
        .from("berlin_roleplay_component_templates")
        .update({
          name,
          description,
          payload,
          version: nextVersion,
          updated_at: now,
        })
        .eq("id", templateId)
        .eq("guild_id", guild.guildId);

      if (error) return { ok: false, error: error.message };

      const { error: versionError } = await getSupabaseAdmin()
        .from("berlin_roleplay_component_versions")
        .upsert(
          {
            template_id: templateId,
            version: nextVersion,
            payload,
            created_at: now,
          },
          { onConflict: "template_id,version" }
        );

      if (versionError) return { ok: false, error: versionError.message };
      revalidatePath(`/dashboard/${guildId}/components`);
      revalidatePath(`/dashboard/${guildId}/components/${templateId}`);
      return { ok: true, message: "Template aktualisiert." };
    }

    const { data, error } = await getSupabaseAdmin()
      .from("berlin_roleplay_component_templates")
      .insert({
        guild_id: guild.guildId,
        name,
        description,
        version: 1,
        payload,
        is_global: false,
        flags: {},
        created_by: user.id,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (data) {
      const { error: versionError } = await getSupabaseAdmin()
        .from("berlin_roleplay_component_versions")
        .insert({
          template_id: data.id,
          version: 1,
          payload,
          created_at: now,
        });

      if (versionError) return { ok: false, error: versionError.message };
    }

    revalidatePath(`/dashboard/${guildId}/components`);
    return { ok: true, message: "Template erstellt." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteComponentTemplate(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    const guild = await requireAdmin(guildId);
    const templateId = String(formData.get("templateId") ?? "").trim();
    if (!templateId) return { ok: false, error: "Template-ID fehlt." };

    const { error } = await getSupabaseAdmin()
      .from("berlin_roleplay_component_templates")
      .delete()
      .eq("id", templateId)
      .eq("guild_id", guild.guildId);

    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/${guildId}/components`);
    return { ok: true, message: "Template gelöscht." };
  } catch (e) {
    return fail(e);
  }
}

const TICKET_STATUS: Record<string, "open" | "claimed" | "closed"> = {
  claim: "claimed",
  close: "closed",
  reopen: "open",
  unclaim: "open",
};

export async function changeTicketStatus(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    await requireAdmin(guildId);
    const ticketId = String(formData.get("ticketId") ?? "");
    const action = String(formData.get("action") ?? "");
    const status = TICKET_STATUS[action];
    if (!status) return { ok: false, error: "Unbekannte Ticket-Aktion" };

    const payload: Record<string, unknown> = { status };
    if (action === "close") {
      payload.closed_at = new Date().toISOString();
    } else if (action === "reopen") {
      payload.closed_at = null;
    }

    const { error } = await getSupabaseAdmin()
      .from("berlin_roleplay_tickets")
      .update(payload)
      .eq("id", ticketId)
      .eq("guild_id", guildId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/${guildId}/tickets`);
    return { ok: true, message: "Ticket aktualisiert." };
  } catch (e) {
    return fail(e);
  }
}

export async function createGiveaway(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    const guild = await requireAdmin(guildId);
    const prize = (formData.get("prize") as string | null)?.trim() || "";
    if (!prize) return { ok: false, error: "Preis ist erforderlich" };
    const winners = Math.max(
      1,
      Number(formData.get("winners_count") ?? 1) || 1
    );
    const channel_id = (formData.get("channel_id") as string | null)?.trim() || "";
    if (!channel_id) {
      return { ok: false, error: "Kanal-ID ist erforderlich" };
    }

    const rawEnd = (formData.get("end_at") as string | null)?.trim();
    const endAt = rawEnd ? new Date(rawEnd).toISOString() : null;
    if (!endAt || Number.isNaN(new Date(endAt).getTime())) {
      return { ok: false, error: "Endzeit ist ungültig" };
    }

    const { data, error } = await getSupabaseAdmin()
      .from("berlin_roleplay_giveaways")
      .insert({
        guild_id: guild.guildId,
        channel_id,
        message_id: "",
        prize,
        winners_count: winners,
        end_at: endAt,
        host_id: "",
        status: "running",
      })
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/${guildId}/giveaways`);
    return { ok: true, message: "Giveaway angelegt." };
  } catch (e) {
    return fail(e);
  }
}

const GIVEAWAY_STATUS: Record<string, "ended" | "cancelled"> = {
  end: "ended",
  cancel: "cancelled",
};

export async function changeGiveawayStatus(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    await requireAdmin(guildId);
    const giveawayId = String(formData.get("giveawayId") ?? "");
    const action = String(formData.get("action") ?? "");
    const status = GIVEAWAY_STATUS[action];
    if (!status) return { ok: false, error: "Unbekannte Giveaway-Aktion" };

    const { error } = await getSupabaseAdmin()
      .from("berlin_roleplay_giveaways")
      .update({ status })
      .eq("id", giveawayId)
      .eq("guild_id", guildId)
      .eq("status", "running");
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/${guildId}/giveaways`);
    return { ok: true, message: "Giveaway aktualisiert." };
  } catch (e) {
    return fail(e);
  }
}

export async function changeERLCServer(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const guildId = String(formData.get("guildId") ?? "");
    await requireAdmin(guildId);
    const serverId = String(formData.get("serverId") ?? "");
    const action = String(formData.get("action") ?? "");
    const enabled = formData.get("enabled") === "on";

    let query = getSupabaseAdmin().from("berlin_roleplay_erlc_servers");
    if (action === "toggle") {
      const { error } = await query
        .update({ enabled })
        .eq("id", serverId)
        .eq("guild_id", guildId);
      if (error) return { ok: false, error: error.message };
    } else if (action === "delete") {
      const { error } = await query
        .delete()
        .eq("id", serverId)
        .eq("guild_id", guildId);
      if (error) return { ok: false, error: error.message };
    } else {
      return { ok: false, error: "Unbekannte Aktion" };
    }
    revalidatePath(`/dashboard/${guildId}/erlc`);
    return { ok: true, message: "ER:LC-Server aktualisiert." };
  } catch (e) {
    return fail(e);
  }
}
