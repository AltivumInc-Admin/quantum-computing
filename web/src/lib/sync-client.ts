// The sync protocol client: pull -> domain-merge -> apply -> push, with
// optimistic concurrency (a 409 means another device pushed since our pull;
// re-pull, re-merge, re-push once — the merge is deterministic, so this
// converges). Auth is the Cognito ID token via aws-amplify's fetchAuthSession
// (auto-refreshing); this module therefore imports aws-amplify and MUST only
// be loaded dynamically after the auth bridge has configured Amplify — the
// <ProgressSync/> component and the workspace page both do so.

import { fetchAuthSession } from "aws-amplify/auth";
import { isAuthConfigured } from "./auth-config";
import {
  exportSnapshot,
  mergeSnapshots,
  applySnapshot,
  resetLocalDeletions,
  type ProgressSnapshot,
} from "./progress-merge";

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

/**
 * The last sync this page load KNOWS the server accepted: the auth header it
 * used, the account it was for, and the exact snapshot + version the server
 * holds. This cache is what makes the exit flush possible at all — page
 * dismissal leaves no time for fetchAuthSession's async token machinery or a
 * pull round trip, so the flush pushes optimistically against this state and
 * lets the server's version check (409) protect against a concurrent device.
 */
interface LastGoodSync {
  auth: string;
  sub: string;
  version: number;
  data: ProgressSnapshot;
}
let lastGood: LastGoodSync | null = null;

/** Test hook — the exit-flush cache is module state. */
export function resetLastGoodSync(): void {
  lastGood = null;
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

/**
 * Delete the caller's entire server-side snapshot (account deletion). The
 * server keys the delete on the verified token's sub; nothing else identifies
 * the row. Local qc:* data is intentionally untouched here — the delete-account
 * flow clears it separately, after every server step has succeeded.
 */
export async function deleteProgress(): Promise<void> {
  const base = syncUrl();
  if (!base || !isAuthConfigured()) throw new Error("sync not configured");
  const { auth } = await session();
  const res = await fetch(`${base}/progress`, {
    method: "DELETE",
    headers: { authorization: auth },
  });
  if (!res.ok) throw new Error(`sync delete failed (${res.status})`);
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
    // The old account's session tombstones must not push deletions into the
    // NEW account's server snapshot.
    resetLocalDeletions();
  }
  // Bind at ATTEMPT, not success: a failed push must not leave the device
  // bound to the previous account (the next auto-sync would then merge this
  // account's freshly-applied data into the OLD account's item — the deferred
  // bleed), and a signed-in user whose syncs all fail must still fence the
  // next account's arrival.
  try {
    localStorage.setItem(
      SYNC_META_KEY,
      JSON.stringify({ lastSyncedAt: readMeta().lastSyncedAt, sub }),
    );
  } catch {
    /* storage unavailable */
  }

  let applied = 0;
  let pushed = false;
  // Two attempts: the retry only runs after a 409 (someone pushed in between).
  for (let attempt = 0; attempt < 2; attempt++) {
    const remote = await pull(base, auth);
    const merged = mergeSnapshots(exportSnapshot(), remote.data);
    applied += applySnapshot(merged);
    if (snapshotsEqual(merged, remote.data)) {
      lastGood = { auth, sub, version: remote.version, data: merged };
      recordSynced(sub);
      return { applied, pushed };
    }
    const result = await push(base, auth, remote.version, merged);
    if (result === "ok") {
      pushed = true;
      // The server assigns baseVersion + 1 (lambda/sync's PUT contract).
      lastGood = { auth, sub, version: remote.version + 1, data: merged };
      recordSynced(sub);
      return { applied, pushed };
    }
  }
  throw new Error("sync conflict persisted after retry");
}

/**
 * Browsers cap a keepalive request's payload at 64KB (shared across in-flight
 * keepalive fetches). A full-mastery snapshot measures ~130KB (card-content
 * caches whole fence sources), so a large flush must fall back to a plain
 * fetch and accept that dismissal may kill it — a killed best-effort flush
 * loses nothing over not flushing at all.
 */
export const KEEPALIVE_BODY_LIMIT = 60_000;

/**
 * Best-effort push of unsynced local progress during page dismissal (pagehide
 * / visibility "hidden"), when the debounced sync can no longer run. Nothing
 * async survives dismissal, so this deliberately differs from syncNow:
 *
 *  - auth is the header cached from the last successful sync — no token fetch;
 *  - no pull round trip: it pushes exportSnapshot() merged over the server
 *    snapshot that sync last confirmed, against that version. If another
 *    device pushed since, the server 409s and nothing is clobbered — the
 *    grades are still in localStorage and sync on the next visit;
 *  - fire-and-forget: initiation is synchronous; the response is observed
 *    only if the page survives (tab re-shown), keeping the cache and the
 *    last-synced metadata accurate for a later flush.
 *
 * Returns true when a flush request was initiated (the caller may stand down
 * its timers); false means nothing was sent — never synced this page load,
 * account binding changed, or nothing unsynced. Never throws.
 */
export function exitFlush(): boolean {
  try {
    const base = syncUrl();
    if (!base || !isAuthConfigured() || !lastGood) return false;
    // Same fence as syncNow: never push under a changed account binding.
    if (readMeta().sub !== lastGood.sub) return false;
    const merged = mergeSnapshots(exportSnapshot(), lastGood.data);
    if (snapshotsEqual(merged, lastGood.data)) return false;
    const body = JSON.stringify({ baseVersion: lastGood.version, data: merged });
    const { auth, sub } = lastGood;
    const nextVersion = lastGood.version + 1;
    fetch(`${base}/progress`, {
      method: "PUT",
      headers: { authorization: auth, "content-type": "application/json" },
      body,
      keepalive: new TextEncoder().encode(body).length <= KEEPALIVE_BODY_LIMIT,
    })
      .then((res) => {
        if (res.ok) {
          lastGood = { auth, sub, version: nextVersion, data: merged };
          recordSynced(sub);
        }
      })
      .catch(() => {
        /* dismissal killed it — the data is still local and syncs later */
      });
    return true;
  } catch {
    return false; // never block dismissal
  }
}
