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
import { ownedLocalKeys, toCanonicalKey, toLocalKey } from "./progress-owner";

const ACTIVITY_PREFIX = "qc:log:day:";
const dayKey = (day: number) => toLocalKey(`${ACTIVITY_PREFIX}${day}`);

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
    // Owner-scoped: an unscoped scan is how the previous learner's streak
    // showed up under a brand-new account.
    for (const localKey of ownedLocalKeys()) {
      const canonical = toCanonicalKey(localKey);
      if (canonical.startsWith(ACTIVITY_PREFIX)) {
        const day = Number(canonical.slice(ACTIVITY_PREFIX.length));
        if (Number.isFinite(day)) days.push(day);
      }
    }
    return days;
  } catch {
    return [];
  }
}
