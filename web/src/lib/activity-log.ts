/**
 * A learner's day-grained activity log. Each active day is recorded as ONE
 * set-once flag `qc:log:day:<epochDay>="1"`. That shape is deliberate: set-once
 * "1" flags union across devices through the EXISTING progress-merge rules
 * (identical values match; one-sided keys are taken from either side), exactly
 * like `qc:section:*`. So the Runbook's streak and contribution graph sync for
 * free — no numeric counter that a lexicographic merge would corrupt, and no
 * change to progress-merge.ts.
 *
 * Storage is guarded exactly like progress-store.ts / review-store.ts. This
 * module never dispatches the qc-progress event itself: its only writers
 * (gradeCard, writeFlag) already dispatch once, so recording activity in the
 * same breath must not double-fire.
 */

import { epochDay } from "./review-schedule";

const ACTIVITY_PREFIX = "qc:log:day:";
const dayKey = (day: number) => `${ACTIVITY_PREFIX}${day}`;

/**
 * Mark today active. Idempotent (a set-once flag), guarded, and silent — the
 * caller owns the qc-progress dispatch. `nowMs` is injectable for tests.
 */
export function recordActivity(nowMs: number = Date.now()): void {
  try {
    localStorage.setItem(dayKey(epochDay(nowMs)), "1");
  } catch {
    /* storage unavailable — the Runbook simply misses this day's dot */
  }
}

/** Every epoch-day the learner was active. */
export function activeDays(): number[] {
  try {
    const days: number[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(ACTIVITY_PREFIX)) {
        const day = Number(k.slice(ACTIVITY_PREFIX.length));
        if (Number.isFinite(day)) days.push(day);
      }
    }
    return days;
  } catch {
    return [];
  }
}
