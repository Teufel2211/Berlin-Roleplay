/**
 * Deutsche UI-Strings (Standardsprache des Bots).
 * Nur hier Texte pflegen; kein Hardcoding in Modulen.
 */

export const i18n = {
  common: {
    cancel: "Abbrechen",
    confirm: "Bestätigen",
    yes: "Ja",
    no: "Nein",
    close: "Schließen",
    save: "Speichern",
    error: "Es ist ein Fehler aufgetreten.",
    noPermission: "Du hast keine Berechtigung für diese Aktion.",
    invalidOptions: "Die angegebenen Optionen sind ungültig.",
  },
  ticket: {
    openTitle: "Ticket erstellt",
    openDescription: "Dein Ticket wurde geöffnet.",
    closeTitle: "Ticket geschlossen",
    claimTitle: "Ticket übernommen",
    unclaimTitle: "Ticket freigegeben",
    systemPanelTitle: "Support-Ticket",
    systemPanelSection: "Wähle eine Kategorie und öffne ein Ticket.",
    buttonOpen: "Ticket öffnen",
    pickCategory: "Kategorie wählen…",
    createdBy: "Erstellt von",
    claimedBy: "Übernommen von",
    maxOpenReached: "Du hast zu viele offene Tickets.",
  },
  giveaway: {
    title: "Giveaway",
    endsAt: "Endet",
    participants: "Teilnehmer",
    join: "Teilnehmen",
    leave: "Nicht mehr teilnehmen",
    winner: "Gewinner",
    noParticipants: "Keine Teilnehmer – keine Gewinner.",
    rerolled: "Neuer Gewinner:",
  },
  welcome: {
    title: "Willkommen",
    footer: "Berlin Roleplay",
  },
  verification: {
    title: "Verifizierung",
    section: "Bestätige deine Verifizierung.",
    button: "Verifizieren",
    checkboxLabel: "Ich bin bereit",
    verified: "Du wurdest erfolgreich verifiziert.",
    already: "Du bist bereits verifiziert.",
    restored: "Rollen wurden wiederhergestellt.",
  },
  erlc: {
    statusTitle: "Serverstatus",
    serverOnline: "Online",
    serverOffline: "Offline",
    players: "Spieler",
    duty: "Dienst",
    incidentCreated: "Vorfall erstellt.",
    incidentClosed: "Vorfall geschlossen.",
    notificationsSent: "Benachrichtigungen gesendet.",
    commandExecuted: "Befehl ausgeführt.",
    notConfigured: "ER:LC ist noch nicht konfiguriert.",
  },
  audit: {
    module: "Modul",
    action: "Aktion",
    target: "Ziel",
    createdAt: "Zeitpunkt",
  },
} as const;

export type I18nKey = keyof typeof i18n;