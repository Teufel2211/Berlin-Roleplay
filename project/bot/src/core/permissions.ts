import { type GuildMember, type Snowflake } from "discord.js";
import { type GuildSettings } from "@berlin/shared";

export type PermissionLevel = "public" | "staff" | "admin";

export function roleId(member: GuildMember, role: string | null): boolean {
  if (!role) return false;
  return member.roles.cache.has(role as Snowflake);
}

export function hasStaff(member: GuildMember, settings: GuildSettings): boolean {
  return roleId(member, settings.roles.staff) || isAdmin(member, settings);
}

export function isAdmin(member: GuildMember, settings: GuildSettings): boolean {
  return roleId(member, settings.roles.admin);
}

/** Prüft, ob ein Member für einen Command mit der gegebenen Permission-Ebene berechtigt ist. */
export function hasPermission(
  member: GuildMember,
  settings: GuildSettings,
  level: PermissionLevel,
): boolean {
  switch (level) {
    case "admin":
      return isAdmin(member, settings);
    case "staff":
      return hasStaff(member, settings);
    case "public":
      return true;
  }
}

export function permissionDenied(member: GuildMember): string {
  return `Du hast keine Berechtigung für diese Aktion, ${member.user.username}.`;
}