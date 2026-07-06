// The ONE place cross-device progress merging is defined. The sync backend
// (lambda/sync) is a deliberately dumb versioned KV; these pure rules decide,
// key by key, which of two qc:* snapshots wins:
//
//   qc:section:* / qc:challenge:* / qc:debug:*  set-once flags -> union ("1" wins)
//   qc:card:*                      CardState wins AS A UNIT by schedule
//                                  recency (lastEpochDay, then lapses — the
//                                  only monotonic counter — then reps); the
//                                  six fields are internally consistent and
//                                  must never be mixed across copies. A copy
//                                  whose lastEpochDay sits in the future
//                                  beyond a small grace window is CLOCK SKEW
//                                  and loses to any plausible copy — without
//                                  this, one fast-clocked device would win
//                                  every merge forever with no recovery.
//   qc:card-content:*              derived cache — prefer the copy that can
//                                  power a live /review re-mount (kind+source)
//   qc:measure:*                   personal best (a NUMERIC minimum) — keep the
//                                  fewer-gates copy; lexMax would wrongly pick
//                                  the LARGER (worse) count.
//   anything else under qc:*       no domain rule
//
// EVERY genuine tie resolves by lexicographic string comparison — symmetric
// and deterministic, so mergeSnapshots(a, b) === mergeSnapshots(b, a) and the
// two-device protocol CONVERGES. (A local-wins tie-break looks harmless but
// makes each device consider its own copy final: they flip the server copy on
// every sync, forever.)
//
// Merging is ADDITIVE across devices: keys never delete cross-device in v1
// (un-completing a section on one device does not un-complete it elsewhere).
// Within a session, keys the learner explicitly deleted on THIS device are
// tombstoned so the next sync doesn't silently re-add them under the click.

import { epochDay, isValidCardState, MAX_INTERVAL, type CardState } from "./review-schedule";

export type ProgressSnapshot = Record<string, string>;

/** Days past "today" a CardState's lastEpochDay may sit before it is treated
 * as clock skew (grading near a timezone/UTC boundary is legitimate). */
export const CLOCK_SKEW_GRACE_DAYS = 2;

// Keys the learner explicitly removed on this device THIS SESSION (e.g.
// un-completing a section). The merge refuses to re-adopt them from the
// server, so the click doesn't undo itself twenty seconds later. Deliberately
// session-scoped: deletion does not propagate cross-device in v1.
const sessionTombstones = new Set<string>();

export function registerLocalDeletion(key: string): void {
  sessionTombstones.add(key);
}

export function clearLocalDeletion(key: string): void {
  sessionTombstones.delete(key);
}

/** Test hook — tombstones are module state. */
export function resetLocalDeletions(): void {
  sessionTombstones.clear();
}

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

function plausible(card: CardState, todayEpochDay: number): boolean {
  // Two invariants the real scheduler always upholds:
  //  (a) lastEpochDay is at most today (+ a grace window for UTC-boundary
  //      grading) — a far-future lastEpochDay is a fast clock;
  //  (b) dueEpochDay = lastEpochDay + interval with interval in
  //      [0, MAX_INTERVAL] — a dueEpochDay outside that band is a corrupt or
  //      hand-crafted item that would freeze the card out of review (isDue is
  //      dueEpochDay <= today, so an absurd dueEpochDay never comes due).
  // A copy violating either loses the merge to any plausible copy and is
  // refused by applySnapshot, so poison never propagates or freezes a card.
  const interval = card.dueEpochDay - card.lastEpochDay;
  return (
    card.lastEpochDay <= todayEpochDay + CLOCK_SKEW_GRACE_DAYS &&
    interval >= 0 &&
    interval <= MAX_INTERVAL
  );
}

/** Symmetric, deterministic tie-break — both sides pick the same winner. */
const lexMax = (a: string, b: string): string => (a >= b ? a : b);

/** The more recently REVIEWED CardState string, taken whole. */
function mergeCard(a: string, b: string, todayEpochDay: number): string {
  const ca = parseCard(a);
  const cb = parseCard(b);
  if (!ca) return cb ? b : lexMax(a, b);
  if (!cb) return a;
  // Clock-skew quarantine: an implausibly future copy loses to any plausible
  // one; when both are implausible, fall through to the normal rules.
  const pa = plausible(ca, todayEpochDay);
  const pb = plausible(cb, todayEpochDay);
  if (pa !== pb) return pa ? a : b;
  if (ca.lastEpochDay !== cb.lastEpochDay) return ca.lastEpochDay > cb.lastEpochDay ? a : b;
  if (ca.lapses !== cb.lapses) return ca.lapses > cb.lapses ? a : b;
  if (ca.reps !== cb.reps) return ca.reps > cb.reps ? a : b;
  return lexMax(a, b);
}

/** A personal best: the fewer-gates copy wins; a corrupt copy loses; tie lexMax. */
function mergeMeasurement(a: string, b: string): string {
  const gatesOf = (raw: string): number | null => {
    try {
      const m = JSON.parse(raw) as { gates?: unknown };
      return typeof m.gates === "number" && Number.isFinite(m.gates) ? m.gates : null;
    } catch {
      return null;
    }
  };
  const ga = gatesOf(a);
  const gb = gatesOf(b);
  if (ga === null) return gb === null ? lexMax(a, b) : b;
  if (gb === null) return a;
  if (ga !== gb) return ga < gb ? a : b;
  return lexMax(a, b);
}

function mergeContent(a: string, b: string): string {
  const liveReady = (raw: string): boolean => {
    try {
      const c = JSON.parse(raw) as { kind?: unknown; source?: unknown };
      return typeof c.kind === "string" && typeof c.source === "string";
    } catch {
      return false;
    }
  };
  const la = liveReady(a);
  if (la !== liveReady(b)) return la ? a : b;
  return lexMax(a, b);
}

/**
 * Merge two snapshots. Symmetric up to session tombstones (which only ever
 * suppress re-adoption of keys deleted on THIS device). `todayEpochDay` is
 * injectable for tests; production callers omit it.
 */
export function mergeSnapshots(
  local: ProgressSnapshot,
  remote: ProgressSnapshot,
  todayEpochDay: number = epochDay(Date.now()),
): ProgressSnapshot {
  const merged: ProgressSnapshot = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[key];
    const r = remote[key];
    if (l === undefined || r === undefined || l === r) {
      merged[key] = (l ?? r)!;
    } else if (key.startsWith("qc:card-content:")) {
      merged[key] = mergeContent(l, r);
    } else if (key.startsWith("qc:card:")) {
      merged[key] = mergeCard(l, r, todayEpochDay);
    } else if (key.startsWith("qc:measure:")) {
      merged[key] = mergeMeasurement(l, r);
    } else {
      // Flags ("1") and future families: identical values already matched
      // above; a genuine difference resolves symmetrically.
      merged[key] = lexMax(l, r);
    }
  }
  return merged;
}

/**
 * Write the merged snapshot into localStorage (additive — never removes keys)
 * and fire the store event once so every mounted reader re-snapshots.
 * Defense-in-depth: refuses to write a clock-skewed CardState even if one
 * slipped into the snapshot (e.g. an already-poisoned server copy).
 * Returns the number of keys that changed.
 */
export function applySnapshot(
  merged: ProgressSnapshot,
  todayEpochDay: number = epochDay(Date.now()),
): number {
  let changed = 0;
  try {
    for (const [key, value] of Object.entries(merged)) {
      // Session tombstones gate ONLY the local write — the key stays in the
      // merged snapshot that gets pushed, so the server copy is preserved. If
      // the tombstone removed it from the push instead, that "local-only"
      // deletion would delete server-side, another device would re-add it,
      // and the pair would flip the key forever (confirmed non-convergence).
      if (sessionTombstones.has(key)) continue;
      if (key.startsWith("qc:card:")) {
        const card = parseCard(value);
        if (card && !plausible(card, todayEpochDay)) continue;
      }
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
