/**
 * A compact, dependency-free spaced-repetition scheduler in the FSRS/SM-2 family.
 * Pure arithmetic only — no storage, no clock — so it is trivially unit-testable
 * and deterministic. The caller injects "today" as an integer epoch-day, matching
 * the repo convention of keeping Date.now() at the edge (see review-store.ts).
 *
 * A card's `stability` is simply its current interval in days; the next interval
 * is the stability multiplied by an ease factor derived from `difficulty`. A
 * lapse ("Again") resets the schedule to one day and nudges difficulty up; "Easy"
 * nudges it down. Intervals are monotonic across successful reviews by
 * construction, and every quantity is clamped to a sane range.
 */

export type Rating = "again" | "hard" | "good" | "easy";

export interface CardState {
  /** Consecutive successful reviews (reset to 0 on a lapse). */
  reps: number;
  /** Total number of lapses ("Again") over the card's life. */
  lapses: number;
  /** Current interval, in days — the basis for the next interval. */
  stability: number;
  /** 1 (easiest) … 10 (hardest); drives the ease multiplier. */
  difficulty: number;
  /** Epoch-day on which the card next becomes due. */
  dueEpochDay: number;
  /** Epoch-day of the most recent review. */
  lastEpochDay: number;
}

export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;
export const DEFAULT_DIFFICULTY = 5;
export const MAX_INTERVAL = 365;

const DIFFICULTY_DELTA: Record<Rating, number> = {
  again: 1.0,
  hard: 0.3,
  good: 0.0,
  easy: -0.3,
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** Whole days since the Unix epoch for a millisecond timestamp. */
export function epochDay(nowMs: number): number {
  return Math.floor(nowMs / 86_400_000);
}

/** A fresh, never-reviewed card that is due immediately. */
export function newCard(todayEpochDay: number): CardState {
  return {
    reps: 0,
    lapses: 0,
    stability: 0,
    difficulty: DEFAULT_DIFFICULTY,
    dueEpochDay: todayEpochDay,
    lastEpochDay: todayEpochDay,
  };
}

/**
 * Ease multiplier applied to the current interval on a mature "Good" review.
 * Maps difficulty 1 → 2.7 (fast growth) and difficulty 10 → 1.3 (slow growth).
 */
function easeFor(difficulty: number): number {
  return 1.3 + (MAX_DIFFICULTY - difficulty) * (1.4 / 9);
}

/**
 * Apply a review grade to a card and return its next state. Pure: same inputs
 * always yield the same output.
 */
export function schedule(state: CardState, rating: Rating, todayEpochDay: number): CardState {
  const difficulty = clamp(state.difficulty + DIFFICULTY_DELTA[rating], MIN_DIFFICULTY, MAX_DIFFICULTY);
  const reps = rating === "again" ? 0 : state.reps + 1;
  const lapses = rating === "again" ? state.lapses + 1 : state.lapses;

  let interval: number;
  if (rating === "again") {
    interval = 1;
  } else if (state.reps === 0) {
    // First successful review (learning step).
    interval = rating === "easy" ? 4 : 1;
  } else if (state.reps === 1) {
    // Second successful review (graduating step).
    interval = rating === "hard" ? 3 : rating === "good" ? 6 : 9;
  } else {
    // Mature review: grow the previous interval by an ease-derived multiplier.
    const ease = easeFor(difficulty);
    const mult = rating === "hard" ? 1.2 : rating === "good" ? ease : ease * 1.3;
    interval = Math.round(state.stability * mult);
  }
  interval = clamp(interval, 1, MAX_INTERVAL);

  return {
    reps,
    lapses,
    stability: interval,
    difficulty,
    dueEpochDay: todayEpochDay + interval,
    lastEpochDay: todayEpochDay,
  };
}

/** A card is due when its due day has arrived (or passed). */
export function isDue(state: CardState, todayEpochDay: number): boolean {
  return state.dueEpochDay <= todayEpochDay;
}

/** Days until the next review, for display ("next review in N days"). */
export function nextIntervalDays(state: CardState): number {
  return Math.max(0, state.dueEpochDay - state.lastEpochDay);
}
