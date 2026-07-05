// The ONE place cross-device progress merging is defined. The sync backend
// (lambda/sync) is a deliberately dumb versioned KV; these pure rules decide,
// key by key, which of two qc:* snapshots wins:
//
//   qc:section:* / qc:challenge:*  set-once flags -> union ("1" wins)
//   qc:card:*                      CardState wins AS A UNIT by schedule
//                                  recency (lastEpochDay, then lapses — the
//                                  only monotonic counter — then reps); the
//                                  six fields are internally consistent and
//                                  must never be mixed across copies
//   qc:card-content:*              derived cache — prefer the copy that can
//                                  power a live /review re-mount (kind+source)
//   anything else under qc:*       prefer LOCAL (first argument)
//
// Merging is ADDITIVE: keys never delete cross-device in v1 (un-completing a
// section on one device does not un-complete it elsewhere).

import { isValidCardState, type CardState } from "./review-schedule";

export type ProgressSnapshot = Record<string, string>;

/** Every qc:* key in localStorage (qc-sync:* metadata is outside the prefix). */
export function exportSnapshot(): ProgressSnapshot {
  const snapshot: ProgressSnapshot = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("qc:")) continue;
      const value = localStorage.getItem(key);
      if (value !== null) snapshot[key] = value;
    }
  } catch {
    /* storage unavailable — sync simply sees an empty device */
  }
  return snapshot;
}

function parseCard(raw: string): CardState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidCardState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The more recently REVIEWED CardState string, taken whole. */
function mergeCard(local: string, remote: string): string {
  const a = parseCard(local);
  const b = parseCard(remote);
  if (!a) return b ? remote : local;
  if (!b) return local;
  if (a.lastEpochDay !== b.lastEpochDay) return a.lastEpochDay > b.lastEpochDay ? local : remote;
  if (a.lapses !== b.lapses) return a.lapses > b.lapses ? local : remote;
  if (a.reps !== b.reps) return a.reps > b.reps ? local : remote;
  return local;
}

function mergeContent(local: string, remote: string): string {
  const liveReady = (raw: string): boolean => {
    try {
      const c = JSON.parse(raw) as { kind?: unknown; source?: unknown };
      return typeof c.kind === "string" && typeof c.source === "string";
    } catch {
      return false;
    }
  };
  if (liveReady(local) === liveReady(remote)) return local;
  return liveReady(local) ? local : remote;
}

/** Merge two snapshots; `local` is the first argument and wins unknown-key ties. */
export function mergeSnapshots(local: ProgressSnapshot, remote: ProgressSnapshot): ProgressSnapshot {
  const merged: ProgressSnapshot = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[key];
    const r = remote[key];
    if (l === undefined || r === undefined || l === r) {
      merged[key] = (l ?? r)!;
    } else if (key.startsWith("qc:card-content:")) {
      merged[key] = mergeContent(l, r);
    } else if (key.startsWith("qc:card:")) {
      merged[key] = mergeCard(l, r);
    } else {
      // Flags ("1") and future families: identical flags already matched
      // above, so a genuine difference falls back to the local copy.
      merged[key] = l;
    }
  }
  return merged;
}

/**
 * Write the merged snapshot into localStorage (additive — never removes keys)
 * and fire the store event once so every mounted reader re-snapshots.
 * Returns the number of keys that changed.
 */
export function applySnapshot(merged: ProgressSnapshot): number {
  let changed = 0;
  try {
    for (const [key, value] of Object.entries(merged)) {
      if (localStorage.getItem(key) !== value) {
        localStorage.setItem(key, value);
        changed++;
      }
    }
    if (changed > 0) window.dispatchEvent(new Event("qc-progress"));
  } catch {
    /* storage unavailable — nothing applied */
  }
  return changed;
}
