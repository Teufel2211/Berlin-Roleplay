/**
 * Slash-Command-Schema: einzige Quelle für Command-Namen, Beschreibungen,
 * Sub-Commands und deren Laufzeit-Berechtigungen.
 */

export type PermissionLevel = "public" | "staff" | "admin";

export type CommandOption =
  | { name: string; description: string; type: "string"; required?: boolean; choices?: { name: string; value: string }[] }
  | { name: string; description: string; type: "channel"; required?: boolean }
  | { name: string; description: string; type: "role"; required?: boolean }
  | { name: string; description: string; type: "user"; required?: boolean }
  | { name: string; description: string; type: "integer"; required?: boolean; min?: number; max?: number }
  | { name: string; description: string; type: "boolean"; required?: boolean };

export interface SubCommand {
  name: string;
  description: string;
  permission?: PermissionLevel;
  options?: CommandOption[];
}

export interface CommandDef {
  name: string;
  description: string;
  permission: PermissionLevel;
  subCommands?: SubCommand[];
  options?: CommandOption[];
}

const staff = (name: string, description: string, options?: CommandOption[]): SubCommand => ({ name, description, permission: "staff", options });
const admin = (name: string, description: string, options?: CommandOption[]): SubCommand => ({ name, description, permission: "admin", options });
const publicSub = (name: string, description: string, options?: CommandOption[]): SubCommand => ({ name, description, permission: "public", options });

export const commands: CommandDef[] = [
  {
    name: "ticket",
    description: "Ticket-System verwalten",
    permission: "public",
    subCommands: [
      staff("setup", "Ticket-Panel einrichten", [{ name: "type", description: "Panel-Typ", type: "string", required: true, choices: [{ name: "Einzel-Ticket", value: "single" }, { name: "Kategorie-Select", value: "category" }] }]),
      publicSub("create", "Neues Ticket öffnen"),
      staff("close", "Ticket schließen"),
      staff("reopen", "Ticket wieder öffnen"),
      staff("delete", "Ticket löschen"),
      staff("claim", "Ticket übernehmen"),
      staff("unclaim", "Ticket freigeben"),
      staff("add", "Benutzer hinzufügen", [{ name: "user", description: "Benutzer", type: "user", required: true }]),
      staff("remove", "Benutzer entfernen", [{ name: "user", description: "Benutzer", type: "user", required: true }]),
      staff("rename", "Ticket umbenennen", [{ name: "name", description: "Neuer Name", type: "string", required: true }]),
      staff("tag", "Ticket-Tag setzen"),
      staff("transcript", "Transcript exportieren"),
      staff("info", "Ticket-Info anzeigen"),
    ],
  },
  {
    name: "giveaway", description: "Giveaways verwalten", permission: "staff",
    subCommands: [
      staff("create", "Giveaway erstellen", [
        { name: "kanal", description: "Kanal", type: "channel", required: true },
        { name: "preis", description: "Preis", type: "string", required: true },
        { name: "gewinner", description: "Anzahl Gewinner", type: "integer", required: true, min: 1, max: 25 },
        { name: "dauer", description: "Dauer in Stunden", type: "integer", required: true, min: 1, max: 8760 },
      ]),
      staff("end", "Giveaway vorzeitig beenden", [{ name: "nachricht", description: "Nachricht (Link/ID)", type: "string", required: true }]),
      staff("reroll", "Gewinner neu ziehen", [{ name: "nachricht", description: "Nachricht (Link/ID)", type: "string", required: true }]),
      staff("cancel", "Giveaway abbrechen", [{ name: "nachricht", description: "Nachricht (Link/ID)", type: "string", required: true }]),
    ],
  },
  {
    name: "welcome", description: "Willkommens-System verwalten", permission: "staff",
    subCommands: [staff("set", "Willkommens-Kanal setzen", [{ name: "kanal", description: "Kanal", type: "channel", required: true }]), staff("test", "Willkommens-Nachricht testen"), staff("disable", "Willkommens-System deaktivieren")],
  },
  {
    name: "verify", description: "Verifizierungs-System verwalten", permission: "staff",
    subCommands: [staff("set", "Verifizierungs-Panel einrichten", [{ name: "kanal", description: "Kanal", type: "channel", required: true }]), staff("check", "Verifizierung prüfen", [{ name: "user", description: "Benutzer", type: "user", required: true }]), staff("unverify", "Verifizierung entziehen", [{ name: "user", description: "Benutzer", type: "user", required: true }]), staff("restore", "Rollen wiederherstellen", [{ name: "user", description: "Benutzer", type: "user", required: true }])],
  },
  {
    name: "components", description: "Components-V2-Templates verwalten", permission: "admin",
    subCommands: [admin("deploy", "Template bereitstellen", [{ name: "template", description: "Template-Name", type: "string", required: true }, { name: "kanal", description: "Kanal", type: "channel" }]), admin("list", "Templates auflisten")],
  },
  {
    name: "erlc", description: "Emergency Response: Liberty County Integration", permission: "staff",
    subCommands: [
      staff("status", "Serverstatus anzeigen"), staff("players", "Spielerliste anzeigen"), staff("staff", "Staff-Liste anzeigen"), staff("factions", "Faktionen anzeigen"), staff("ranks", "Ränge anzeigen"),
      staff("join", "Dem Server beitreten"), staff("leave", "Server verlassen"),
      staff("duty", "Dienst beginnen/beenden", [{ name: "aktion", description: "Aktion", type: "string", required: true, choices: [{ name: "Beginnen", value: "start" }, { name: "Beenden", value: "end" }] }]),
      staff("incident", "Vorfall erstellen", [{ name: "beschreibung", description: "Beschreibung", type: "string", required: true }]), staff("incident-close", "Vorfall schließen"),
      staff("notify", "Benachrichtigung senden", [{ name: "text", description: "Text", type: "string", required: true }]),
      staff("panel", "Status-Panel verwalten", [{ name: "aktion", description: "Aktion", type: "string", required: true, choices: [{ name: "Erstellen", value: "create" }, { name: "Löschen", value: "delete" }, { name: "Aktualisieren", value: "refresh" }] }]),
      staff("stats", "Statistiken anzeigen", [{ name: "zeitraum", description: "Zeitraum", type: "string", required: true, choices: [{ name: "24h", value: "24h" }, { name: "7 Tage", value: "7d" }, { name: "30 Tage", value: "30d" }] }]),
      staff("perms", "Berechtigungen anzeigen/setzen", [{ name: "aktion", description: "Aktion", type: "string", required: true, choices: [{ name: "Anzeigen", value: "view" }, { name: "Setzen", value: "set" }] }, { name: "rolle", description: "Rolle", type: "role" }]),
      staff("command", "Roh-Befehl an das Spiel senden", [{ name: "cmd", description: "Befehl", type: "string", required: true }]),
    ],
  },
  { name: "audit", description: "Audit-Log durchsuchen", permission: "staff", subCommands: [staff("view", "Einträge anzeigen", [{ name: "filter", description: "Filter (Modul/Aktion)", type: "string" }])] },
  { name: "admin", description: "Admin-Werkzeuge", permission: "admin", subCommands: [admin("reload-settings", "Einstellungen neu laden"), admin("sync-guilds", "Guilds synchronisieren")] },
];

export function findCommand(name: string): CommandDef | undefined {
  return commands.find((c) => c.name === name);
}
