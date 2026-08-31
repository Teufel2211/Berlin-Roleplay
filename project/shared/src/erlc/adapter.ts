/**
 * ER:LC (Emergency Response: Liberty County) API v2 – Typen & Adapter-Interface.
 * Real API: https://api.erlc.gg/v2 (beta) mit `server-key`-Header.
 * Für Tests: mockErlcAdapter.
 */

export interface ErlcServerInfo {
  id: string;
  name: string;
  online: boolean;
  players: number;
  maxPlayers: number;
  queue: number;
  version: string;
  currentMap: string;
  modded: boolean;
  serverTime: number;
  fps: number;
  branch: string;
}

export interface ErlcPlayer {
  id: string;
  name: string;
  callsign?: string;
  rankId: string;
  factionId?: string | null;
  permission: "owner" | "admin" | "moderator" | "regular";
  duty: boolean;
  patrol: boolean;
  status?: string;
  from: string;
  ping: number;
  joinTime: number;
}

export interface ErlcFaction {
  id: string;
  name: string;
  tag: string;
  roles: ErlcFactionRole[];
}

export interface ErlcFactionRole {
  id: string;
  name: string;
  permissions: string[];
}

export interface ErlcIncident {
  id: string;
  title: string;
  description: string;
  ownerId?: string;
  reportedById?: string;
  createdAt?: string;
  closed?: boolean;
}

export interface ErlcCommandResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

/** Adapter-Interface: Bot + Dashboard sprechen nur diese Abstraktion an. */
export interface ErlcAdapter {
  fetchServer(): Promise<ErlcServerInfo>;
  fetchPlayers(): Promise<ErlcPlayer[]>;
  fetchFactions(): Promise<ErlcFaction[]>;
  fetchRanks(factionId?: string): Promise<ErlcFactionRole[]>;
  sendCommand(command: string): Promise<ErlcCommandResult>;
}

/** Deterministischer Fake-Adapter für Tests & Entwicklung (useMock=true). */
export function mockErlcAdapter(): ErlcAdapter {
  const players: ErlcPlayer[] = [
    { id: "1", name: "Max Mustermann", callsign: "K-42", rankId: "r1", factionId: "f1", permission: "moderator", duty: true, patrol: false, from: "Germany", ping: 24, joinTime: Date.now() },
    { id: "2", name: "Erika Beispiel", rankId: "r2", factionId: "f2", permission: "regular", duty: false, patrol: false, from: "Austria", ping: 31, joinTime: Date.now() },
  ];
  const factions: ErlcFaction[] = [
    { id: "f1", name: "Polizei Berlin", tag: "POL", roles: [
      { id: "r1", name: "Polizeipräsident", permissions: ["command"] },
      { id: "r2", name: "Streifenbeamter", permissions: [] },
    ] },
    { id: "f2", name: "Feuerwehr Berlin", tag: "FFW", roles: [
      { id: "r3", name: "Wehrführer", permissions: ["command"] },
    ] },
  ];

  return {
    async fetchServer() {
      return { id: "mock", name: "Mock-Server", online: true, players: players.length, maxPlayers: 128, queue: 0, version: "mock", currentMap: "Liberty County", modded: false, serverTime: Date.now(), fps: 60, branch: "mock" };
    },
    async fetchPlayers() {
      return players;
    },
    async fetchFactions() {
      return factions;
    },
    async fetchRanks(factionId?: string) {
      if (factionId) {
        const faction = factions.find((f) => f.id === factionId);
        return faction ? faction.roles : [];
      }
      return factions.flatMap((f) => f.roles);
    },
    async sendCommand(command: string) {
      if (!command.trim()) return { success: false, error: "Befehl ist leer." };
      return { success: true };
    },
  };
}