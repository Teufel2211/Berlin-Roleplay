/**
 * Slash-Command-Schema: einzige Quelle für Command-Namen, Beschreibungen
 * und Sub-Commands. Der Bot registriert Commands aus diesem Schema
 * (guild-scoped + optional global).
 */

export type CommandOption =
  | {
      name: string;
      description: string;
      type: "string";
      required?: boolean;
      choices?: { name: string; value: string }[];
    }
  | { name: string; description: string; type: "channel"; required?: boolean }
  | { name: string; description: string; type: "role"; required?: boolean }
  | { name: string; description: string; type: "user"; required?: boolean }
  | { name: string; description: string; type: "integer"; required?: boolean; min?: number; max?: number }
  | { name: string; description: string; type: "boolean"; required?: boolean };

export interface SubCommand {
  name: string;
  description: string;
  options?: CommandOption[];
}

export interface CommandDef {
  name: string;
  description: string;
  permission: "public" | "staff" | "admin";
  subCommands?: SubCommand[];
  options?: CommandOption[];
}

/** Komplette Command-Liste lt. Spec §9. */
export const commands: CommandDef[] = [
  {
    name: "ticket",
    description: "Ticket-System verwalten",
    permission: "public",
    subCommands: [
      { name: "setup", description: "Ticket-Panel einrichten", options: [{ name: "type", description: "Panel-Typ", type: "string", required: true, choices: [{ name: "Einzel-Ticket", value: "single" }, { name: "Kategorie-Select", value: "category" }] }] },
      { name: "create", description: "Neues Ticket öffnen" },
      { name: "close", description: "Ticket schließen" },
      { name: "reopen", description: "Ticket wieder öffnen" },
      { name: "delete", description: "Ticket löschen" },
      { name: "claim", description: "Ticket übernehmen" },
      { name: "unclaim", description: "Ticket freigeben" },
      { name: "add", description: "Benutzer hinzufügen", options: [{ name: "user", description: "Benutzer", type: "user", required: true }] },
      { name: "remove", description: "Benutzer entfernen", options: [{ name: "user", description: "Benutzer", type: "user", required: true }] },
      { name: "rename", description: "Ticket umbenennen", options: [{ name: "name", description: "Neuer Name", type: "string", required: true }] },
      { name: "tag", description: "Ticket-Tag setzen" },
      { name: "transcript", description: "Transcript exportieren" },
      { name: "info", description: "Ticket-Info anzeigen" },
    ],
  },
  {
    name: "giveaway",
    description: "Giveaways verwalten",
    permission: "staff",
    subCommands: [
      { name: "create", description: "Giveaway erstellen", options: [
        { name: "kanal", description: "Kanal", type: "channel", required: true },
        { name: "preis", description: "Preis", type: "string", required: true },
        { name: "gewinner", description: "Anzahl Gewinner", type: "integer", required: true, min: 1, max: 25 },
        { name: "dauer", description: "Dauer in Stunden", type: "integer", required: true, min: 1, max: 8760 },
      ] },
      { name: "end", description: "Giveaway vorzeitig beenden", options: [{ name: "nachricht", description: "Nachricht (Link/ID)", type: "string", required: true }] },
      { name: "reroll", description: "Gewinner neu ziehen", options: [{ name: "nachricht", description: "Nachricht (Link/ID)", type: "string", required: true }] },
      { name: "cancel", description: "Giveaway abbrechen", options: [{ name: "nachricht", description: "Nachricht (Link/ID)", type: "string", required: true }] },
    ],
  },
  {
    name: "welcome",
    description: "Willkommens-System verwalten",
    permission: "staff",
    subCommands: [
      { name: "set", description: "Willkommens-Kanal setzen", options: [{ name: "kanal", description: "Kanal", type: "channel", required: true }] },
      { name: "test", description: "Willkommens-Nachricht testen" },
      { name: "disable", description: "Willkommens-System deaktivieren" },
    ],
  },
  {
    name: "verify",
    description: "Verifizierungs-System verwalten",
    permission: "staff",
    subCommands: [
      { name: "set", description: "Verifizierungs-Panel einrichten", options: [{ name: "kanal", description: "Kanal", type: "channel", required: true }] },
      { name: "check", description: "Verifizierung prüfen", options: [{ name: "user", description: "Benutzer", type: "user", required: true }] },
      { name: "unverify", description: "Verifizierung entziehen", options: [{ name: "user", description: "Benutzer", type: "user", required: true }] },
      { name: "restore", description: "Rollen wiederherstellen", options: [{ name: "user", description: "Benutzer", type: "user", required: true }] },
    ],
  },
  {
    name: "components",
    description: "Components-V2-Templates verwalten",
    permission: "admin",
    subCommands: [
      { name: "deploy", description: "Template bereitstellen", options: [
        { name: "template", description: "Template-Name", type: "string", required: true },
        { name: "kanal", description: "Kanal", type: "channel" },
      ] },
      { name: "list", description: "Templates auflisten" },
    ],
  },
  {
    name: "erlc",
    description: "Emergency Response: Liberty County Integration",
    permission: "staff",
    subCommands: [
      { name: "status", description: "Serverstatus anzeigen" },
      { name: "players", description: "Spielerliste anzeigen" },
      { name: "staff", description: "Staff-Liste anzeigen" },
      { name: "factions", description: "Faktionen anzeigen" },
      { name: "ranks", description: "Ränge anzeigen" },
      { name: "join", description: "Dem Server beitreten" },
      { name: "leave", description: "Server verlassen" },
      { name: "duty", description: "Dienst beginnen/beenden", options: [
        { name: "aktion", description: "Aktion", type: "string", required: true, choices: [{ name: "Beginnen", value: "start" }, { name: "Beenden", value: "end" }] },
      ] },
      { name: "incident", description: "Vorfall erstellen", options: [{ name: "beschreibung", description: "Beschreibung", type: "string", required: true }] },
      { name: "incident-close", description: "Vorfall schließen" },
      { name: "notify", description: "Benachrichtigung senden", options: [{ name: "text", description: "Text", type: "string", required: true }] },
      { name: "panel", description: "Status-Panel verwalten", options: [{ name: "aktion", description: "Aktion", type: "string", required: true, choices: [{ name: "Erstellen", value: "create" }, { name: "Löschen", value: "delete" }, { name: "Aktualisieren", value: "refresh" }] }] },
      { name: "stats", description: "Statistiken anzeigen", options: [{ name: "zeitraum", description: "Zeitraum", type: "string", required: true, choices: [{ name: "24h", value: "24h" }, { name: "7 Tage", value: "7d" }, { name: "30 Tage", value: "30d" }] }] },
      { name: "perms", description: "Berechtigungen anzeigen/setzen", options: [
        { name: "aktion", description: "Aktion", type: "string", required: true, choices: [{ name: "Anzeigen", value: "view" }, { name: "Setzen", value: "set" }] },
        { name: "rolle", description: "Rolle", type: "role" },
      ] },
      { name: "command", description: "Roh-Befehl an das Spiel senden", options: [{ name: "cmd", description: "Befehl", type: "string", required: true }] },
    ],
  },
  {
    name: "audit",
    description: "Audit-Log durchsuchen",
    permission: "staff",
    subCommands: [{ name: "view", description: "Einträge anzeigen", options: [{ name: "filter", description: "Filter (Modul/Aktion)", type: "string" }] }],
  },
  {
    name: "admin",
    description: "Admin-Werkzeuge",
    permission: "admin",
    subCommands: [
      { name: "reload-settings", description: "Einstellungen neu laden" },
      { name: "sync-guilds", description: "Guilds synchronisieren" },
    ],
  },
];

export function findCommand(name: string): CommandDef | undefined {
  return commands.find((c) => c.name === name);
}