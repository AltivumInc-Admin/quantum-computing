/**
 * Pure Runbook kernel — the streak / contribution-graph / mastery math, with no
 * storage and no clock (today is injected as an integer epoch-day, matching the
 * scheduler convention in review-schedule.ts). Everything the Runbook surface
 * shows derives from data that already syncs cross-device:
 *   - active days come from set-once `qc:log:day:*` flags (union-merged like
 *     section flags — see activity-log.ts / progress-merge.ts),
 *   - mastery and freezes derive from CardState (merged as a unit).
 * So there is nothing here that a fast-clock or a concurrent device can corrupt.
 */

import type { CardState } from "./review-schedule";

/** A card whose current interval has reached "proven retention" (≈3 weeks). */
export const RETENTION_STABILITY = 21;
/** Skills brought into retention that earn one streak-freeze. Earned, never bought. */
export const REPS_PER_FREEZE = 10;

// Epoch day 0 is a Thursday; the most recent Monday on/before it is day -3, so a
// Monday-started week index is floor((d + 3) / 7). Weekday is Monday=0 … Sunday=6.
export function weekOf(epochDay: number): number {
  return Math.floor((epochDay + 3) / 7);
}
export function weekdayMon(epochDay: number): number {
  return (((epochDay + 3) % 7) + 7) % 7;
}
/** The Monday (epoch-day) that opens a given week index — inverse of weekOf. */
export function weekStartDay(week: number): number {
  return week * 7 - 3;
}

export interface StreakResult {
  /** Consecutive active weeks in the current run (frozen weeks keep the run alive but are not counted). */
  currentWeeks: number;
  /** Longest run of consecutive active weeks ever (pure — no freeze applied). */
  longestWeeks: number;
  /** Earned freezes spent bridging single-week gaps in the current run. */
  freezesUsed: number;
}

/**
 * The current weekly streak. Weekly cadence (respects binge-then-vanish): a week
 * counts if it holds any activity. The CURRENT week is "in progress" — being
 * inactive so far does not break the run. An earned freeze bridges a SINGLE
 * inactive-week gap; two inactive weeks in a row end the run regardless of
 * freezes left.
 */
export function streak(activeDays: number[], today: number, freezesEarned: number): StreakResult {
  const activeWeeks = new Set(activeDays.map(weekOf));
  if (activeWeeks.size === 0) return { currentWeeks: 0, longestWeeks: 0, freezesUsed: 0 };

  const cur = weekOf(today);
  // An inactive current week is grace: start the walk one week back without breaking.
  let w = activeWeeks.has(cur) ? cur : cur - 1;
  const floor = Math.min(...activeWeeks) - 1; // defensive lower bound
  let currentWeeks = 0;
  let freezesUsed = 0;
  let lastWasBridge = false;
  while (w >= floor) {
    if (activeWeeks.has(w)) {
      currentWeeks++;
      lastWasBridge = false;
      w--;
    } else if (!lastWasBridge && freezesUsed < freezesEarned) {
      // Bridge one gap with an earned freeze; a frozen week is not itself counted.
      freezesUsed++;
      lastWasBridge = true;
      w--;
    } else {
      break;
    }
  }

  return { currentWeeks, longestWeeks: longestRun(activeWeeks), freezesUsed };
}

/** Longest run of consecutive active week indices. */
function longestRun(activeWeeks: Set<number>): number {
  const sorted = [...activeWeeks].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev = NaN;
  for (const w of sorted) {
    run = w === prev + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = w;
  }
  return longest;
}

/** Skills currently in proven retention — the North-Star "mastery gained" headline. */
export function masteryCount(states: CardState[]): number {
  return states.reduce((n, s) => (s.stability >= RETENTION_STABILITY ? n + 1 : n), 0);
}

/** Retained skills last reviewed in the current week (this week's mastery activity). */
export function masteredThisWeek(states: CardState[], today: number): number {
  const cur = weekOf(today);
  return states.reduce(
    (n, s) => (s.stability >= RETENTION_STABILITY && weekOf(s.lastEpochDay) === cur ? n + 1 : n),
    0,
  );
}

/** Earned freezes: one per REPS_PER_FREEZE skills in retention (mastery can't be crammed). */
export function freezesEarned(mastered: number): number {
  return Math.floor(mastered / REPS_PER_FREEZE);
}

export interface ContributionCell {
  epochDay: number;
  weekCol: number; // 0 (oldest) … weeks-1 (current week)
  weekday: number; // 0 = Monday … 6 = Sunday
  active: boolean;
  future: boolean; // beyond `today` — the rest of the current week
}

/**
 * A GitHub-style grid: `weeks` columns (oldest first, ending with today's week)
 * × 7 weekday rows. Column-major, weekday-minor, so the first cell of the last
 * column is the current week's Monday.
 */
export function contributionCells(
  activeDays: number[],
  today: number,
  weeks = 26,
): ContributionCell[] {
  const active = new Set(activeDays);
  const startWeek = weekOf(today) - (weeks - 1);
  const cells: ContributionCell[] = [];
  for (let weekCol = 0; weekCol < weeks; weekCol++) {
    const monday = weekStartDay(startWeek + weekCol);
    for (let weekday = 0; weekday < 7; weekday++) {
      const epochDay = monday + weekday;
      cells.push({
        epochDay,
        weekCol,
        weekday,
        active: active.has(epochDay),
        future: epochDay > today,
      });
    }
  }
  return cells;
}
