/**
 * A compact, dependency-free spaced-repetition scheduler in the FSRS/SM-2 family.
 * Pure arithmetic only — no storage, no clock — so it is trivially unit-testable
 * and deterministic. The caller injects "today" as an integer epoch-day, matching
 * the repo convention of keeping Date.now() at the edge (see review-store.ts).
 *
 * A card's `stability` is simply its current interval in days; on a mature
 * review the next interval is the larger of the current stability and the days
 * the card was actually overdue, multiplied by an ease factor derived from
 * `difficulty` — so a long-overdue pass is credited the elapsed time (the
 * defining behavior of the FSRS/SM-2 family) and earns a longer interval than
 * the same grade given exactly on the due day. A lapse ("Again") resets the
 * schedule to one day and nudges difficulty up; "Easy" nudges it down. Intervals
 * are monotonic across successful reviews by construction, and every quantity is
 * clamped to a sane range.
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

/**
 * A stored card record is only usable if it is an object whose every numeric
 * field is finite. A semantically-broken-but-valid-JSON record (`{}`, truncated,
 * an old schema) would otherwise feed NaN into the scheduler arithmetic and
 * silently poison the schedule — callers should discard a record that fails this
 * and fall back to newCard().
 */
export function isValidCardState(x: unknown): x is CardState {
  if (typeof x !== "object" || x === null) return false;
  const c = x as Record<string, unknown>;
  return (
    Number.isFinite(c.reps) &&
    Number.isFinite(c.lapses) &&
    Number.isFinite(c.stability) &&
    Number.isFinite(c.difficulty) &&
    Number.isFinite(c.dueEpochDay) &&
    Number.isFinite(c.lastEpochDay)
  );
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
    // Mature review: grow the previous interval by an ease-derived multiplier,
    // crediting overdue time (FSRS/SM-2 family) so a long-overdue pass earns a
    // longer interval than the same grade given exactly on the due day. An early
    // review (graded before due) clamps elapsed to 0, preserving on-time growth.
    const elapsed = Math.max(0, todayEpochDay - state.dueEpochDay);
    const growthBase = Math.max(state.stability, elapsed);
    const ease = easeFor(difficulty);
    const mult = rating === "hard" ? 1.2 : rating === "good" ? ease : ease * 1.3;
    interval = Math.round(growthBase * mult);
  }
  interval = clamp(interval, 1, MAX_INTERVAL);
  // A passing review must never shorten the interval (SM-2 monotonicity): the
  // graduating "hard" step (3) would otherwise fall below an "easy" first step (4).
  if (rating !== "again") interval = Math.max(interval, state.stability);

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

/**
 * The day phrasing every schedule note shares ("tomorrow" / "in 6 days"). The
 * six graded Reps and the recall card each render a different sentence around
 * it ("Reviewed — next review …", "Added to your review — back …", "Next review
 * …"), but the boundary test belongs in one place: the widgets had drifted onto
 * `<= 1` while review-card used `=== 1` for the identical decision.
 *
 * Optional `t` binds the active locale; without it, English is used so pure
 * unit tests and call sites that have not adopted i18n yet stay deterministic.
 */
export function reviewDayPhrase(
  days: number,
  t?: (key: string, values?: Record<string, string | number>, count?: number) => string,
): string {
  if (t) {
    return days <= 1
      ? t("schedule.tomorrow")
      : t("schedule.inDays", { count: days }, days);
  }
  return days <= 1 ? "tomorrow" : `in ${days} days`;
}

/**
 * Parse a stored card record, discarding anything `isValidCardState` rejects.
 * Storage-free and clock-free, so it lives beside the guard rather than being
 * re-implemented at each trust boundary — review-store, progress-merge and
 * review-card all read the same raw strings and must agree on what is usable.
 */
export function parseCardState(raw: string | null): CardState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidCardState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
