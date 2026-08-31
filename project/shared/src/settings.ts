/**
 * Guild-Settings: liegen als JSONB in `berlin_roleplay_guilds.settings`.
 * Defaults hier = Quelle der Wahrheit. Kein EAV-Schema.
 */

export interface GuildSettings {
  /** Discord-Rollen */
  roles: {
    staff: string | null;
    admin: string | null;
    verified: string | null;
    ticketTeam: string | null;
    giveawayEligible: string | null;
    warteraum: string | null;
    welcomeRoles: string[];
  };
  /** Ticket-System */
  ticket: {
    categoryId: string | null;
    staffChannelId: string | null;
    transcriptChannelId: string | null;
    autoCloseHours: number;
    maxOpenPerUser: number;
    panelMessageId: string | null;
  };
  /** Giveaways */
  giveaway: {
    defaultDurationHours: number;
    requireRole: boolean;
  };
  /** Welcome */
  welcome: {
    channelId: string | null;
    enabled: boolean;
    messageTemplate: string;
  };
  /** Verifizierung */
  verification: {
    enabled: boolean;
    channelId: string | null;
    panelMessageId: string | null;
    method: "button" | "checkbox";
  };
  /** ER:LC */
  erlc: {
    serverKey: string | null;
    serverId: string | null;
    pollIntervalSeconds: number;
    statusChannelId: string | null;
    notifyRoleId: string | null;
    useMock: boolean;
  };
  /** Audit */
  audit: {
    channelId: string | null;
    includeUserActions: boolean;
  };
}

export const DEFAULT_SETTINGS: GuildSettings = {
  roles: {
    staff: null,
    admin: null,
    verified: null,
    ticketTeam: null,
    giveawayEligible: null,
    warteraum: null,
    welcomeRoles: [],
  },
  ticket: {
    categoryId: null,
    staffChannelId: null,
    transcriptChannelId: null,
    autoCloseHours: 48,
    maxOpenPerUser: 5,
    panelMessageId: null,
  },
  giveaway: {
    defaultDurationHours: 24,
    requireRole: false,
  },
  welcome: {
    channelId: null,
    enabled: false,
    messageTemplate: "",
  },
  verification: {
    enabled: true,
    channelId: null,
    panelMessageId: null,
    method: "button",
  },
  erlc: {
    serverKey: null,
    serverId: null,
    pollIntervalSeconds: 30,
    statusChannelId: null,
    notifyRoleId: null,
    useMock: false,
  },
  audit: {
    channelId: null,
    includeUserActions: true,
  },
};

/** Deep-merge mit Defaults; unbekannte/leere Werte fallen auf Default zurück. */
export function resolveSettings(raw: unknown): GuildSettings {
  const base: GuildSettings = structuredClone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Record<string, unknown>;

  const mergeRoles = (section: Record<string, unknown>): void => {
    base.roles.staff = strOrNull(section.staff) ?? base.roles.staff;
    base.roles.admin = strOrNull(section.admin) ?? base.roles.admin;
    base.roles.verified = strOrNull(section.verified) ?? base.roles.verified;
    base.roles.ticketTeam = strOrNull(section.ticketTeam) ?? base.roles.ticketTeam;
    base.roles.giveawayEligible = strOrNull(section.giveawayEligible) ?? base.roles.giveawayEligible;
    base.roles.warteraum = strOrNull(section.warteraum) ?? base.roles.warteraum;
    if (Array.isArray(section.welcomeRoles)) base.roles.welcomeRoles = section.welcomeRoles.filter((r): r is string => typeof r === "string");
  };
  const mergeTicket = (section: Record<string, unknown>): void => {
    base.ticket.categoryId = strOrNull(section.categoryId) ?? base.ticket.categoryId;
    base.ticket.staffChannelId = strOrNull(section.staffChannelId) ?? base.ticket.staffChannelId;
    base.ticket.transcriptChannelId = strOrNull(section.transcriptChannelId) ?? base.ticket.transcriptChannelId;
    base.ticket.autoCloseHours = numOr(section.autoCloseHours, base.ticket.autoCloseHours);
    base.ticket.maxOpenPerUser = numOr(section.maxOpenPerUser, base.ticket.maxOpenPerUser);
    base.ticket.panelMessageId = strOrNull(section.panelMessageId) ?? base.ticket.panelMessageId;
  };

  if (src.roles && typeof src.roles === "object") mergeRoles(src.roles as Record<string, unknown>);
  if (src.ticket && typeof src.ticket === "object") mergeTicket(src.ticket as Record<string, unknown>);
  if (src.giveaway && typeof src.giveaway === "object") {
    base.giveaway.defaultDurationHours = numOr((src.giveaway as Record<string, unknown>).defaultDurationHours, base.giveaway.defaultDurationHours);
    base.giveaway.requireRole = boolOr((src.giveaway as Record<string, unknown>).requireRole, base.giveaway.requireRole);
  }
  if (src.welcome && typeof src.welcome === "object") {
    base.welcome.channelId = strOrNull((src.welcome as Record<string, unknown>).channelId) ?? base.welcome.channelId;
    base.welcome.enabled = boolOr((src.welcome as Record<string, unknown>).enabled, base.welcome.enabled);
    const tpl = (src.welcome as Record<string, unknown>).messageTemplate;
    if (typeof tpl === "string") base.welcome.messageTemplate = tpl;
  }
  if (src.verification && typeof src.verification === "object") {
    const section = src.verification as Record<string, unknown>;
    base.verification.enabled = boolOr(section.enabled, base.verification.enabled);
    base.verification.channelId = strOrNull(section.channelId) ?? base.verification.channelId;
    base.verification.panelMessageId = strOrNull(section.panelMessageId) ?? base.verification.panelMessageId;
    base.verification.method = section.method === "checkbox" ? "checkbox" : "button";
  }
  if (src.erlc && typeof src.erlc === "object") {
    const section = src.erlc as Record<string, unknown>;
    base.erlc.serverKey = strOrNull(section.serverKey) ?? base.erlc.serverKey;
    base.erlc.serverId = strOrNull(section.serverId) ?? base.erlc.serverId;
    base.erlc.pollIntervalSeconds = numOr(section.pollIntervalSeconds, base.erlc.pollIntervalSeconds);
    base.erlc.statusChannelId = strOrNull(section.statusChannelId) ?? base.erlc.statusChannelId;
    base.erlc.notifyRoleId = strOrNull(section.notifyRoleId) ?? base.erlc.notifyRoleId;
    base.erlc.useMock = boolOr(section.useMock, base.erlc.useMock);
  }
  if (src.audit && typeof src.audit === "object") {
    base.audit.channelId = strOrNull((src.audit as Record<string, unknown>).channelId) ?? base.audit.channelId;
    base.audit.includeUserActions = boolOr((src.audit as Record<string, unknown>).includeUserActions, base.audit.includeUserActions);
  }
  return base;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}