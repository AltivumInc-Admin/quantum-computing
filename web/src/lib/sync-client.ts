// The sync protocol client: pull -> domain-merge -> apply -> push, with
// optimistic concurrency (a 409 means another device pushed since our pull;
// re-pull, re-merge, re-push once — the merge is deterministic, so this
// converges). Auth is the Cognito ID token via aws-amplify's fetchAuthSession
// (auto-refreshing); this module therefore imports aws-amplify and MUST only
// be loaded dynamically after the auth bridge has configured Amplify — the
// <ProgressSync/> component and the workspace page both do so.

import { fetchAuthSession } from "aws-amplify/auth";
import { isAuthConfigured } from "./auth-config";
import { exportSnapshot, mergeSnapshots, applySnapshot } from "./progress-merge";

export const SYNC_META_KEY = "qc-sync:meta"; // outside qc:* so it never syncs

/**
 * The device's qc:* data is bound to the Cognito account it last synced as.
 * Without this, a shared computer (or one person with two accounts) silently
 * cross-contaminates both accounts' server snapshots: signing in as B would
 * merge A's device progress into B's item. On mismatch, syncNow throws this
 * and the caller must resolve with an explicit accountChange choice.
 */
export class SyncAccountMismatchError extends Error {
  constructor() {
    super("this device's progress was synced by a different account");
    this.name = "SyncAccountMismatch";
  }
}

export type AccountChange = "adopt" | "reset";

export function syncUrl(): string | null {
  return process.env.NEXT_PUBLIC_SYNC_URL || null;
}

export function isSyncConfigured(): boolean {
  return syncUrl() !== null && isAuthConfigured();
}

export interface SyncResult {
  /** Keys updated locally by the merge (remote knowledge gained). */
  applied: number;
  /** Whether a push was needed (local knowledge the server lacked). */
  pushed: boolean;
}

interface Remote {
  version: number;
  data: Record<string, string>;
}

async function session(): Promise<{ auth: string; sub: string }> {
  const { tokens } = await fetchAuthSession();
  const token = tokens?.idToken?.toString();
  const sub = tokens?.idToken?.payload?.sub;
  if (!token || typeof sub !== "string") throw new Error("not signed in");
  return { auth: `Bearer ${token}`, sub };
}

async function pull(base: string, auth: string): Promise<Remote> {
  const res = await fetch(`${base}/progress`, { headers: { authorization: auth } });
  if (!res.ok) throw new Error(`sync pull failed (${res.status})`);
  return (await res.json()) as Remote;
}

async function push(
  base: string,
  auth: string,
  baseVersion: number,
  data: Record<string, string>,
): Promise<"ok" | "conflict"> {
  const res = await fetch(`${base}/progress`, {
    method: "PUT",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify({ baseVersion, data }),
  });
  if (res.status === 409) return "conflict";
  if (!res.ok) throw new Error(`sync push failed (${res.status})`);
  return "ok";
}

function snapshotsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => b[k] === a[k]);
}

interface SyncMeta {
  lastSyncedAt?: number;
  sub?: string;
}

function readMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    return raw ? (JSON.parse(raw) as SyncMeta) : {};
  } catch {
    return {};
  }
}

function recordSynced(sub: string): void {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastSyncedAt: Date.now(), sub }));
    window.dispatchEvent(new Event("qc-sync"));
  } catch {
    /* metadata only */
  }
}

export function lastSyncedAt(): number | null {
  const t = readMeta().lastSyncedAt;
  return typeof t === "number" ? t : null;
}

/** Wipe this device's qc:* progress (the "use account data only" choice). */
function resetLocalProgress(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("qc:")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    if (keys.length > 0) window.dispatchEvent(new Event("qc-progress"));
  } catch {
    /* storage unavailable */
  }
}

export async function syncNow(options?: { accountChange?: AccountChange }): Promise<SyncResult> {
  const base = syncUrl();
  if (!base || !isAuthConfigured()) throw new Error("sync not configured");
  const { auth, sub } = await session();

  // Account binding: first-ever sync adopts the device's progress (the normal
  // "studied anonymously, then signed up" flow); a CHANGED account requires an
  // explicit choice before anything merges.
  const boundSub = readMeta().sub;
  if (boundSub && boundSub !== sub) {
    if (options?.accountChange === "reset") resetLocalProgress();
    else if (options?.accountChange !== "adopt") throw new SyncAccountMismatchError();
  }

  let applied = 0;
  let pushed = false;
  // Two attempts: the retry only runs after a 409 (someone pushed in between).
  for (let attempt = 0; attempt < 2; attempt++) {
    const remote = await pull(base, auth);
    const merged = mergeSnapshots(exportSnapshot(), remote.data);
    applied += applySnapshot(merged);
    if (snapshotsEqual(merged, remote.data)) {
      recordSynced(sub);
      return { applied, pushed };
    }
    const result = await push(base, auth, remote.version, merged);
    if (result === "ok") {
      pushed = true;
      recordSynced(sub);
      return { applied, pushed };
    }
  }
  throw new Error("sync conflict persisted after retry");
}
