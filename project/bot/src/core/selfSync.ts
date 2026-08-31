/**
 * SelfSyncService — eingebetteter Auto-Update-Poller für den Bot.
 *
 * Zieht Änderungen im Monorepo (nur `project/bot/` + `project/shared/`) direkt vom
 * GitHub-Repo, installiert bei Bedarf Abhängigkeiten neu, baut shared + bot und
 * startet den Prozess neu. Analog zum früheren Standalone-selfsync, angepasst an
 * das pnpm/Turborepo-Monorepo.
 *
 * Voraussetzung: Der Server-Checkout enthält das komplette Monorepo (project/ + pnpm-workspace)
 * und der Bot wird aus `project/bot/` gestartet (CWD = project/bot).
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Logger } from "./logger.js";
import { redact } from "./config.js";

const OWNER = "Teufel2211";
const REPO = "Berlin-Roleplay";
const BRANCH = "main";
const API = "https://api.github.com";
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/`;

/** Reine Repo-Wurzel: enthält project/ + pnpm-workspace.yaml (Monorepo-Checkout). */
const REPO_ROOT = resolve(process.cwd(), "..", "..");

/** SHA-Marker für inkrementelle Diffs. */
const SHA_FILE = join(REPO_ROOT, ".deploy-sha");

/** Nur diese relativen Repo-Pfade werden berücksichtigt (Bot + shared). */
const SCOPED = ["project/bot/", "project/shared/", "project/tsconfig.base.json"];

/** Root-Tooling-Dateien, die einen re-install auslösen. */
const INSTALL_MARKERS = new Set([
  "project/bot/package.json",
  "project/shared/package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
]);

const SKIP_DIRS = new Set(["node_modules", "dist", ".pnpm-store", ".turbo", ".git", "logs", ".next", ".vercel"]);

function inScope(remotePath: string): boolean {
  if (SCOPED.some((p) => remotePath === p || remotePath.startsWith(p))) {
    return !remotePath.split("/").some((seg) => SKIP_DIRS.has(seg));
  }
  return false;
}

function localTarget(remotePath: string): string {
  // remotePath beginnt mit "project/bot" oder "project/shared"; REPO_ROOT enthält project/
  const rel = remotePath.replace("project/bot/", "").replace("project/shared/", "");
  const base = remotePath.startsWith("project/shared/") ? "project/shared" : "project/bot";
  if (!remotePath.startsWith("project/")) {
    // tsconfig.base.json etc. an der project-Wurzel
    return join(REPO_ROOT, remotePath);
  }
  return join(REPO_ROOT, base, rel);
}

async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function gh<T>(route: string): Promise<T> {
  const res = await retry(() =>
    fetch(`${API}${route}`, {
      headers: { "User-Agent": "berlin-selfsync", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    }),
  );
  if (!res.ok) throw new Error(`GitHub-API ${res.status}: ${route}`);
  return (await res.json()) as T;
}

async function fetchRaw(file: string): Promise<Buffer> {
  const res = await retry(() =>
    fetch(RAW + file.split("/").map(encodeURIComponent).join("/"), {
      headers: { "User-Agent": "berlin-selfsync" },
      signal: AbortSignal.timeout(30_000),
    }),
  );
  if (!res.ok) throw new Error(`Download ${res.status}: ${file}`);
  return Buffer.from(await res.arrayBuffer());
}

function writeLocal(target: string, buf: Buffer): void {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buf);
}

function removeLocal(target: string): void {
  try {
    unlinkSync(target);
  } catch {
    /* bereits entfernt */
  }
}

function readSha(): string {
  try {
    return readFileSync(SHA_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

function latestCommitSha(): Promise<string> {
  return gh<{ sha: string }>(`/repos/${OWNER}/${REPO}/commits/${BRANCH}`).then((c) => c.sha);
}

function spawn(cmd: string, args: string[], cwd: string, logger: Logger): { status: number | null } {
  logger.info(`SelfSync: ${cmd} ${args.join(" ")} (cwd=${cwd})`);
  const res = spawnSync(cmd, args, { cwd, shell: process.platform === "win32", stdio: "pipe" });
  const out = (res.stdout?.toString() ?? "") + (res.stderr?.toString() ?? "");
  if (out.trim()) logger.info(redact(out.trim().slice(0, 2000)));
  return { status: res.status };
}

export interface SelfSyncStatus {
  enabled: boolean;
  checks: number;
  lastCheckAt: string | null;
  lastResult: string;
  lastCount: number;
  lastFiles: string[];
  lastError: string | null;
  sha: string | null;
}

export interface SelfSyncOptions {
  enabled: boolean;
  intervalMs: number;
  logger: Logger;
}

export class SelfSyncService {
  readonly #opts: SelfSyncOptions;
  #timer: ReturnType<typeof setInterval> | null = null;
  #busy = false;
  #errorCount = 0;
  readonly #status: SelfSyncStatus;

  constructor(opts: SelfSyncOptions) {
    this.#opts = opts;
    this.#status = {
      enabled: opts.enabled,
      checks: 0,
      lastCheckAt: null,
      lastResult: "idle",
      lastCount: 0,
      lastFiles: [],
      lastError: null,
      sha: readSha() || null,
    };
  }

  status(): SelfSyncStatus {
    return { ...this.#status };
  }

  start(): void {
    if (!this.#opts.enabled) {
      this.#opts.logger.info("SelfSync deaktiviert (SELF_UPDATE != true).");
      return;
    }
    this.#opts.logger.info(
      `SelfSync aktiv – prüft alle ${Math.round(this.#opts.intervalMs / 1000)}s auf neue Commits (${OWNER}/${REPO}@${BRANCH}).`,
    );
    const run = (): void => void this.#tick().catch(() => {});
    setTimeout(run, 15_000);
    this.#timer = setInterval(run, this.#opts.intervalMs);
  }

  async #tick(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    this.#status.checks += 1;
    this.#status.lastCheckAt = new Date().toISOString();
    try {
      const base = readSha();
      let head: string;
      let applied = 0;
      let files: string[] = [];
      let needsInstall = false;
      let updated = false;

      if (!base) {
        // Erstinstallation/Voll-Sync
        const sha = await latestCommitSha();
        const tree = await gh<{ tree: { type: string; path: string }[] }>(
          `/repos/${OWNER}/${REPO}/git/trees/${sha}?recursive=1`,
        );
        const scoped = (tree.tree || []).filter((e) => e.type === "blob" && inScope(e.path));
        for (const e of scoped) {
          writeLocal(localTarget(e.path), await fetchRaw(e.path));
          if (INSTALL_MARKERS.has(e.path)) needsInstall = true;
        }
        applied = scoped.length;
        head = sha;
        updated = true;
        this.#status.lastResult = "installed";
        this.#status.lastFiles = [`Erstinstallation: ${applied} Dateien`];
      } else {
        const cmp = await gh<{
          files?: { status: string; filename: string; previous_filename?: string }[];
        }>(`/repos/${OWNER}/${REPO}/compare/${base}...${BRANCH}`);
        const changed = (cmp.files || []).filter((f) => inScope(f.filename));
        for (const f of changed) {
          if (INSTALL_MARKERS.has(f.filename)) needsInstall = true;
          const local = localTarget(f.filename);
          if (f.status === "removed") {
            removeLocal(local);
            files.push(`-${f.filename}`);
          } else {
            if (f.previous_filename) removeLocal(localTarget(f.previous_filename));
            writeLocal(local, await fetchRaw(f.filename));
            files.push(`+${f.filename}`);
          }
        }
        applied = changed.length;
        head = await latestCommitSha();
        updated = applied > 0;
        this.#status.lastResult = updated ? "updated" : "up-to-date";
        this.#status.lastFiles = files;
      }

      this.#status.sha = head;
      this.#status.lastCount = applied;
      this.#status.lastError = null;
      writeFileSync(SHA_FILE, head);

      if (!updated) {
        this.#errorCount = 0;
        this.#opts.logger.info(`SelfSync: keine Änderungen (${head.slice(0, 7)}).`);
        return;
      }

      if (needsInstall) {
        const inst = spawn("pnpm", ["install", "--no-audit", "--no-fund"], REPO_ROOT, this.#opts.logger);
        if (inst.status !== 0) this.#opts.logger.warn(`SelfSync: pnpm install beendet mit Code ${inst.status}.`);
      }
      const bShared = spawn("pnpm", ["--filter", "@berlin/shared", "build"], REPO_ROOT, this.#opts.logger);
      if (bShared.status !== 0) this.#opts.logger.warn(`SelfSync: shared-Build fehlgeschlagen (Code ${bShared.status}).`);
      const bBot = spawn("pnpm", ["--filter", "@berlin/bot", "build"], REPO_ROOT, this.#opts.logger);
      if (bBot.status !== 0) this.#opts.logger.warn(`SelfSync: Bot-Build fehlgeschlagen (Code ${bBot.status}).`);

      this.#errorCount = 0;
      this.#opts.logger.info(`SelfSync: ${applied} Datei(en) aktualisiert (${files.join(", ") || "Voll-Sync"}, Commit ${head.slice(0, 7)}). Starte neu…`);
      setTimeout(() => process.exit(0), 1500).unref();
    } catch (err) {
      this.#errorCount += 1;
      this.#status.lastResult = "error";
      this.#status.lastError = err instanceof Error ? err.message : String(err);
      this.#opts.logger.error(`SelfSync fehlgeschlagen (${this.#errorCount}): ${err instanceof Error ? err.stack || err.message : err}`);
      if (this.#errorCount >= 5 && this.#timer) {
        this.#opts.logger.error("SelfSync nach 5 Fehlern deaktiviert.");
        clearInterval(this.#timer);
        this.#timer = null;
        this.#status.enabled = false;
      }
    } finally {
      this.#busy = false;
    }
  }
}
