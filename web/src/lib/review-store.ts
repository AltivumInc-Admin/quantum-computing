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
  isValidCardState,
} from "./review-schedule";
import { PROGRESS_EVENT_NAME, subscribe } from "./progress-store";

const CARD_PREFIX = "qc:card:";
const cardKey = (id: string) => `${CARD_PREFIX}${id}`;

const CONTENT_PREFIX = "qc:card-content:";
const contentKey = (id: string) => `${CONTENT_PREFIX}${id}`;

export interface CardContent {
  prompt: string;
  answer: string;
}

/**
 * Cache a card's prompt/answer the first time it is seen in a lesson, so the
 * /review page can re-render it from the schedule alone (the schedule is keyed by
 * id only). A card can only become due after being graded — which requires having
 * seen it — so due cards always have their content cached.
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

export function getCardState(id: string): CardState | null {
  const raw = getCardStateRaw(id);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Discard a corrupt-but-valid-JSON record ({}, truncated, old schema) so the
    // caller falls back to newCard() instead of building on NaN fields.
    return isValidCardState(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
  if (existing !== null && !isDue(existing, epochDay(nowMs))) return null;
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

// Re-export so consumers subscribe to progress changes from one module.
export { subscribe, PROGRESS_EVENT_NAME };
