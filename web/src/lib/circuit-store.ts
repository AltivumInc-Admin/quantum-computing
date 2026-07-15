// Saved playground circuits, persisted under qc:circuit:<id> so they ride the
// existing sync snapshot with zero server changes (the lambda accepts any
// qc:*-keyed string). Deletion is a VALUE tombstone {v:1, deleted:true,
// updatedAt} — never removeItem — because the merge protocol is additive and a
// removed key would resurrect from the server on the next sync. The
// corresponding merge rule (recency by updatedAt, clock-skew quarantined)
// lives in progress-merge.ts.
//
// Caps are enforced at SAVE time with an honest error, not at sync time: the
// whole-snapshot PUT is all-or-nothing against a 256KB server cap, so an
// unbounded circuit collection would wedge the learner's ENTIRE sync — 20
// circuits x 2,000 chars keeps the family's worst case near 40KB.
//
// Storage idioms follow review-store.ts: every access try/catch-guarded (SSR
// and private mode degrade silently), validators — not key versions — absorb
// schema drift, and the qc-progress event fires ONLY on explicit save/delete
// (never per keystroke) so the sync debounce and workspace re-reads stay calm.

import { recordActivity } from "./activity-log";
import { PROGRESS_EVENT_NAME } from "./progress-store";

export type SavedCircuit = { id: string; name: string; src: string; updatedAt: number };

export const CIRCUIT_KEY_PREFIX = "qc:circuit:";
export const MAX_SAVED_CIRCUITS = 20;
export const MAX_CIRCUIT_SRC = 2000;
export const MAX_CIRCUIT_NAME = 80;

type StoredLive = { v: 1; name: string; src: string; updatedAt: number };
type StoredTombstone = { v: 1; deleted: true; updatedAt: number };

const circuitKey = (id: string) => `${CIRCUIT_KEY_PREFIX}${id}`;

function parseStored(raw: string): StoredLive | StoredTombstone | null {
  try {
    const c: unknown = JSON.parse(raw);
    if (typeof c !== "object" || c === null) return null;
    const o = c as Record<string, unknown>;
    if (o.v !== 1 || typeof o.updatedAt !== "number" || !Number.isFinite(o.updatedAt)) return null;
    if (o.deleted === true) return { v: 1, deleted: true, updatedAt: o.updatedAt };
    if (typeof o.name !== "string" || typeof o.src !== "string") return null;
    // Lenient on read: length caps are save-time policy, not read-time — a
    // synced copy from an older/newer cap regime must still load.
    return { v: 1, name: o.name, src: o.src, updatedAt: o.updatedAt };
  } catch {
    return null;
  }
}

function dispatchProgress(): void {
  window.dispatchEvent(new Event(PROGRESS_EVENT_NAME));
}

/** Every live (non-deleted, non-corrupt) saved circuit, most recently touched first. */
export function listCircuits(): SavedCircuit[] {
  const out: SavedCircuit[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(CIRCUIT_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const stored = parseStored(raw);
      if (!stored || "deleted" in stored) continue;
      out.push({
        id: key.slice(CIRCUIT_KEY_PREFIX.length),
        name: stored.name,
        src: stored.src,
        updatedAt: stored.updatedAt,
      });
    }
  } catch {
    /* storage unavailable — the shelf is simply empty */
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
}

export function readCircuit(id: string): SavedCircuit | null {
  try {
    const raw = localStorage.getItem(circuitKey(id));
    if (raw === null) return null;
    const stored = parseStored(raw);
    if (!stored || "deleted" in stored) return null;
    return { id, name: stored.name, src: stored.src, updatedAt: stored.updatedAt };
  } catch {
    return null;
  }
}

export function saveCircuit(
  input: { id?: string; name: string; src: string },
  nowMs: number = Date.now(),
): { ok: true; circuit: SavedCircuit } | { ok: false; error: string } {
  const name = input.name.trim();
  if (name.length === 0) return { ok: false, error: "give the circuit a name" };
  if (name.length > MAX_CIRCUIT_NAME) {
    return { ok: false, error: `name is too long (${MAX_CIRCUIT_NAME} characters max)` };
  }
  if (input.src.trim().length === 0) return { ok: false, error: "the circuit is empty" };
  if (input.src.length > MAX_CIRCUIT_SRC) {
    return { ok: false, error: `circuit is too long (${MAX_CIRCUIT_SRC} characters max)` };
  }
  try {
    const id = input.id ?? crypto.randomUUID();
    // Overwriting a live circuit never hits the cap; new ids (and revivals of
    // deleted ones) count against it.
    if (readCircuit(id) === null && listCircuits().length >= MAX_SAVED_CIRCUITS) {
      return {
        ok: false,
        error: `save limit reached (${MAX_SAVED_CIRCUITS}) — delete a circuit first`,
      };
    }
    const stored: StoredLive = { v: 1, name, src: input.src, updatedAt: nowMs };
    localStorage.setItem(circuitKey(id), JSON.stringify(stored));
    recordActivity(nowMs); // building circuits is Runbook activity (rides this dispatch)
    dispatchProgress();
    return { ok: true, circuit: { id, name, src: input.src, updatedAt: nowMs } };
  } catch {
    return { ok: false, error: "could not save — storage is unavailable" };
  }
}

/** Tombstone the circuit (the value, not the key) so the deletion syncs. */
export function deleteCircuit(id: string, nowMs: number = Date.now()): void {
  try {
    if (localStorage.getItem(circuitKey(id)) === null) return;
    const tombstone: StoredTombstone = { v: 1, deleted: true, updatedAt: nowMs };
    localStorage.setItem(circuitKey(id), JSON.stringify(tombstone));
    dispatchProgress();
  } catch {
    /* storage unavailable — nothing to delete */
  }
}
