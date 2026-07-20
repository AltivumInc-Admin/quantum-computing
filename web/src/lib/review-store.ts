/**
 * localStorage glue for the spaced-repetition scheduler. This is the only layer
 * that touches the clock and the browser; the scheduling math lives in the pure
 * review-schedule.ts kernel. Writes broadcast the SAME "qc-progress" event the
 * section progress store and the Challenge widget already use, so the nav badge
 * and the /review dashboard update through a single channel.
 *
 * Every storage access is guarded exactly like progress-store.ts: reads fall back
 * to null/empty, writes silently no-op when storage is unavailable (private mode,
 * SSR). The clock is injectable on every reader/writer so tests stay deterministic.
 */

import {
  type CardState,
  type Rating,
  newCard,
  schedule,
  isDue,
  epochDay,
  parseCardState,
} from "./review-schedule";
import { PROGRESS_EVENT_NAME, subscribe } from "./progress-store";
import { recordActivity } from "./activity-log";

const CARD_PREFIX = "qc:card:";
const cardKey = (id: string) => `${CARD_PREFIX}${id}`;

const CONTENT_PREFIX = "qc:card-content:";
const contentKey = (id: string) => `${CONTENT_PREFIX}${id}`;

/** The graded-Rep kinds /review can re-mount as LIVE widgets (see review-dashboard). */
export type CardKind = "challenge" | "predict" | "bloch" | "cost" | "debug" | "expect";

export interface CardContent {
  prompt: string;
  answer: string;
  /**
   * Rep kind + the raw fence source, cached by the graded widgets so /review
   * can re-mount the LIVE widget for a genuine re-attempt instead of a text
   * recall card. Absent for authored qcards and for content cached before
   * these fields existed — readers must treat them as optional and fall back.
   */
  kind?: CardKind;
  source?: string;
}

/**
 * Cache a card's prompt/answer the first time it is seen in a lesson, so the
 * /review page can re-render it from the schedule alone (the schedule is keyed by
 * id only). A card can only become due after being graded — which requires having
 * seen it — so due cards are EXPECTED to have their content cached.
 *
 * That expectation is not enforced, and readers must not assume it: this write
 * can fail (quota, eviction) while the much smaller CardState write in
 * gradeCard later succeeds, and getCardContent also returns null on a corrupt
 * record. review-dashboard therefore resolves content BEFORE deriving its
 * roster, so a content-less due card falls out cleanly instead of rendering an
 * empty list item that still occupies a numbered slot.
 */
export function setCardContent(id: string, content: CardContent): void {
  try {
    localStorage.setItem(contentKey(id), JSON.stringify(content));
  } catch {
    /* storage unavailable — the card simply won't appear on /review this session */
  }
}

export function getCardContent(id: string): CardContent | null {
  try {
    const raw = localStorage.getItem(contentKey(id));
    return raw ? (JSON.parse(raw) as CardContent) : null;
  } catch {
    return null;
  }
}

/**
 * The stored state, or null. Routed through the shared `parseCardState`, which
 * discards a corrupt-but-valid-JSON record ({}, truncated, old schema) so the
 * caller falls back to newCard() instead of building on NaN fields — the same
 * gate progress-merge and review-card read through, so every surface agrees on
 * what counts as a usable record.
 */
export function getCardState(id: string): CardState | null {
  return parseCardState(getCardStateRaw(id));
}

/**
 * The raw stored JSON string (or null). Returned verbatim so it is a stable
 * value-equal snapshot for useSyncExternalStore — parsing on every render would
 * mint a fresh object and spin React's snapshot check.
 */
export function getCardStateRaw(id: string): string | null {
  try {
    return localStorage.getItem(cardKey(id));
  } catch {
    return null;
  }
}

/**
 * Grade a card: load its state (or start a fresh one), advance the schedule, and
 * persist. Returns the new state so the widget can show "next review in N days".
 * `nowMs` is injectable for deterministic tests; production callers omit it.
 */
export function gradeCard(id: string, rating: Rating, nowMs: number = Date.now()): CardState {
  const today = epochDay(nowMs);
  const prev = getCardState(id) ?? newCard(today);
  const next = schedule(prev, rating, today);
  try {
    localStorage.setItem(cardKey(id), JSON.stringify(next));
    recordActivity(nowMs); // log the day for the Runbook (rides this dispatch)
    window.dispatchEvent(new Event(PROGRESS_EVENT_NAME));
  } catch {
    /* storage unavailable — grading still works in-session, just isn't remembered */
  }
  return next;
}

/**
 * Grade a card ONLY if it is new or currently due. Re-solving a challenge that is
 * not yet due is practice, not a spaced review, so it must not advance the
 * schedule (otherwise repeated same-session re-checks would inflate the interval).
 * Returns the new CardState when it graded, or null when the solve was a no-op.
 */
export function gradeCardIfDue(id: string, rating: Rating, nowMs: number = Date.now()): CardState | null {
  const existing = getCardState(id);
  if (existing !== null && !isDue(existing, epochDay(nowMs))) {
    // Re-practicing a not-yet-due card must not advance the schedule, but it is
    // still the learner showing up — log the active day for the Runbook graph.
    recordActivity(nowMs);
    window.dispatchEvent(new Event(PROGRESS_EVENT_NAME));
    return null;
  }
  return gradeCard(id, rating, nowMs);
}

/** Every card id that has been reviewed at least once (has stored state). */
export function getAllCardIds(): string[] {
  try {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CARD_PREFIX)) ids.push(k.slice(CARD_PREFIX.length));
    }
    return ids;
  } catch {
    return [];
  }
}

/** Every stored CardState (valid records only) — the Runbook's mastery source. */
export function getAllCardStates(): CardState[] {
  const states: CardState[] = [];
  for (const id of getAllCardIds()) {
    const s = getCardState(id);
    if (s) states.push(s);
  }
  return states;
}

/** Card ids whose due day has arrived, given the current (or injected) clock. */
export function dueCardIds(nowMs: number = Date.now()): string[] {
  const today = epochDay(nowMs);
  return getAllCardIds().filter((id) => {
    const s = getCardState(id);
    return s ? isDue(s, today) : false;
  });
}

/** Number of cards currently due — what the nav badge shows. */
export function dueCount(nowMs: number = Date.now()): number {
  return dueCardIds(nowMs).length;
}

/**
 * Human labels for each graded-Rep kind. Lifted here from review-dashboard.tsx so
 * the /review roster and the /workspace "Due now" breakdown name a kind identically
 * — review-dashboard imports it back. Shared-module edit: the /review suite must stay
 * green (it asserts these exact strings).
 */
export const KIND_LABELS: Record<CardKind, string> = {
  challenge: "Circuit challenge",
  predict: "Prediction",
  bloch: "Bloch target",
  cost: "Cost estimate",
  debug: "Fix the circuit",
  expect: "Expectation value",
};

/**
 * Normalize a stored `kind` to a bucket the breakdown can render. `getCardContent`
 * is an unchecked cast at a localStorage/sync trust boundary, so the field can be
 * any string — including a prototype key. Own-property membership (not `??`, which
 * only catches null/undefined, and not a raw index, which inherits from
 * Object.prototype) collapses every unrecognized value into "unknown".
 */
function kindBucket(kind: string | undefined): CardKind | "unknown" {
  return kind && Object.hasOwn(KIND_LABELS, kind) ? (kind as CardKind) : "unknown";
}

/**
 * The due count, broken down by Rep kind — the Valve's named breakdown ("4 Circuit
 * challenge · 2 Prediction · 1 Bloch target"). A due card whose content was cached
 * before `kind` existed, is an authored qcard, or carries an unrecognized kind
 * counts under "unknown", so the parts always sum to dueCount() — workspace.ts
 * renders a FIXED key list, so a foreign bucket would vanish from the rows while
 * still inflating the headline number.
 */
export function dueByKind(nowMs: number = Date.now()): Record<CardKind | "unknown", number> {
  const counts = {} as Record<CardKind | "unknown", number>;
  for (const id of dueCardIds(nowMs)) {
    const kind = kindBucket(getCardContent(id)?.kind);
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

// Re-export so consumers subscribe to progress changes from one module.
export { subscribe, PROGRESS_EVENT_NAME };
