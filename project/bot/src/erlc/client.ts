import {
  type ErlcAdapter,
  type ErlcCommandResult,
  type ErlcFaction,
  type ErlcFactionRole,
  type ErlcIncident,
  type ErlcPlayer,
  type ErlcServerInfo,
} from "@berlin/shared";

const DEFAULT_BASE_URL = "https://api.erlc.gg/v2";

/**
 * ER:LC REST-Client (api.erlc.gg/v2).
 * - `server-key`-Header
 * - Retry bei 429/5xx/Netzwerkfehlern mit exponentiellem Backoff
 */
export class ErlcClient implements ErlcAdapter {
  readonly #baseUrl: string;
  readonly #serverKey: string;

  constructor(serverKey: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.#serverKey = serverKey;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
  }

  fetchServer(): Promise<ErlcServerInfo> {
    return this.request<ErlcServerInfo>("/server");
  }

  fetchPlayers(): Promise<ErlcPlayer[]> {
    return this.request<ErlcPlayer[]>("/players");
  }

  fetchFactions(): Promise<ErlcFaction[]> {
    return this.request<ErlcFaction[]>("/factions");
  }

  fetchRanks(factionId?: string): Promise<ErlcFactionRole[]> {
    const path = factionId ? `/faction/${factionId}/roles` : "/faction-roles";
    return this.request<ErlcFactionRole[]>(path);
  }

  sendCommand(command: string): Promise<ErlcCommandResult> {
    return this.request<ErlcCommandResult>("/command", {
      method: "POST",
      body: JSON.stringify({ command }),
    }).then(
      (r) => ({ success: true, data: r }),
      (err: unknown) => ({ success: false, error: err instanceof Error ? err.message : String(err) }),
    );
  }

  /** Vorfälle (für Incident-Automatik). */
  fetchIncidents(open?: boolean): Promise<ErlcIncident[]> {
    return this.request<ErlcIncident[]>(open ? "/incidents?open=true" : "/incidents");
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.#baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const attempts = 3;

    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          headers: {
            "server-key": this.#serverKey,
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) return (await res.json()) as T;

        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < attempts) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new Error(`ER:LC ${res.status}: ${await safeText(res)}`);
      } catch (err) {
        if (attempt < attempts && isRetryable(err)) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw err;
      }
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  return /fetch failed|ECONN|ETIMEDOUT|Abort/i.test(err.message);
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<kein Body>";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}