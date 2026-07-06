import {
  weekOf,
  weekdayMon,
  weekStartDay,
  streak,
  masteryCount,
  masteredThisWeek,
  freezesEarned,
  contributionCells,
  RETENTION_STABILITY,
  REPS_PER_FREEZE,
} from "@/lib/runbook";
import type { CardState } from "@/lib/review-schedule";

// Epoch day 4 = Monday 1970-01-05 (day 0 is a Thursday). Weeks start Monday.
const MON = 4; // a Monday
const card = (over: Partial<CardState> = {}): CardState => ({
  reps: 3,
  lapses: 0,
  stability: 30,
  difficulty: 5,
  dueEpochDay: 100,
  lastEpochDay: 90,
  ...over,
});

describe("calendar helpers", () => {
  it("weekOf increments on Mondays, holds Mon–Sun", () => {
    expect(weekOf(MON)).toBe(weekOf(MON + 6)); // Mon..Sun same week
    expect(weekOf(MON + 7)).toBe(weekOf(MON) + 1); // next Monday, next week
    expect(weekOf(MON - 1)).toBe(weekOf(MON) - 1); // the prior Sunday
  });

  it("weekdayMon maps Monday→0 … Sunday→6", () => {
    expect(weekdayMon(MON)).toBe(0);
    expect(weekdayMon(MON + 1)).toBe(1);
    expect(weekdayMon(MON + 6)).toBe(6);
  });

  it("weekStartDay is the inverse of weekOf (the week's Monday)", () => {
    for (const d of [MON, MON + 3, MON + 700, MON - 30]) {
      expect(weekStartDay(weekOf(d))).toBe(d - weekdayMon(d));
      expect(weekOf(weekStartDay(weekOf(d)))).toBe(weekOf(d));
    }
  });
});

describe("streak", () => {
  const today = MON + 70; // 10 weeks after MON
  const dayIn = (weeksAgo: number) => today - weeksAgo * 7; // same weekday, N weeks back

  it("no activity → zero streak", () => {
    expect(streak([], today, 0)).toEqual({ currentWeeks: 0, longestWeeks: 0, freezesUsed: 0 });
  });

  it("activity only this week → 1", () => {
    expect(streak([today], today, 0).currentWeeks).toBe(1);
  });

  it("counts consecutive active weeks", () => {
    const days = [0, 1, 2, 3].map(dayIn); // this week + 3 prior
    expect(streak(days, today, 0).currentWeeks).toBe(4);
  });

  it("an inactive CURRENT week is in-progress — it does not break a prior streak", () => {
    const days = [1, 2, 3].map(dayIn); // active last 3 weeks, NOT this week
    expect(streak(days, today, 0).currentWeeks).toBe(3);
  });

  it("a single-week gap breaks the streak with no freeze", () => {
    const days = [0, 1, 3, 4].map(dayIn); // gap at week 2-ago
    expect(streak(days, today, 0).currentWeeks).toBe(2); // only weeks 0 and 1
  });

  it("a freeze bridges a single-week gap (counting active weeks, freeze not counted)", () => {
    const days = [0, 1, 3, 4].map(dayIn); // gap at 2-ago
    const s = streak(days, today, 1);
    expect(s.currentWeeks).toBe(4); // 0,1 + bridged + 3,4
    expect(s.freezesUsed).toBe(1);
  });

  it("two consecutive gaps break even with freezes available", () => {
    const days = [0, 1, 4, 5].map(dayIn); // gaps at 2-ago AND 3-ago
    const s = streak(days, today, 3);
    expect(s.currentWeeks).toBe(2); // 0,1 then a double gap stops it
    expect(s.freezesUsed).toBe(1); // one freeze spent trying to bridge the first gap
  });

  it("longestWeeks is the longest pure run of consecutive active weeks (no freeze)", () => {
    // active weeks: {0,1} now, and {5,6,7,8} a longer run earlier.
    const days = [0, 1, 5, 6, 7, 8].map(dayIn);
    expect(streak(days, today, 5).longestWeeks).toBe(4);
  });

  it("does NOT spend a phantom freeze on a gapless run down to the earliest active week", () => {
    // A flawless streak that reaches the learner's first active week must not
    // report a freeze as "holding a missed week" — there is no gap.
    expect(streak([0, 1].map(dayIn), today, 1).freezesUsed).toBe(0);
    // A one-week-old account with an earned freeze and no misses: still 0.
    expect(streak([today], today, 1)).toEqual({
      currentWeeks: 1,
      longestWeeks: 1,
      freezesUsed: 0,
    });
  });
});

describe("mastery + earned freezes", () => {
  const today = 20000;
  it("masteryCount counts cards at/over the retention threshold", () => {
    const states = [
      card({ stability: RETENTION_STABILITY }), // exactly at threshold — counts
      card({ stability: RETENTION_STABILITY - 1 }), // below — not yet
      card({ stability: 200 }),
    ];
    expect(masteryCount(states)).toBe(2);
  });

  it("masteredThisWeek counts retained cards last reviewed in the current week", () => {
    const states = [
      card({ stability: 40, lastEpochDay: today }), // this week, retained
      card({ stability: 40, lastEpochDay: today - 14 }), // retained but older
      card({ stability: 5, lastEpochDay: today }), // this week but not retained
    ];
    expect(masteredThisWeek(states, today)).toBe(1);
  });

  it("freezesEarned = floor(mastered / REPS_PER_FREEZE)", () => {
    expect(freezesEarned(0)).toBe(0);
    expect(freezesEarned(REPS_PER_FREEZE - 1)).toBe(0);
    expect(freezesEarned(REPS_PER_FREEZE)).toBe(1);
    expect(freezesEarned(REPS_PER_FREEZE * 2 + 3)).toBe(2);
  });
});

describe("contributionCells", () => {
  const today = MON + 70;

  it("returns a 7-row grid for the requested week span, ending at today's week", () => {
    const cells = contributionCells([], today, 26);
    expect(cells).toHaveLength(26 * 7);
    // The last column's Monday-row cell is the current week's Monday.
    const lastCol = cells.filter((c) => c.weekCol === 25);
    expect(lastCol).toHaveLength(7);
    expect(weekOf(lastCol[0].epochDay)).toBe(weekOf(today));
  });

  it("marks active days and flags future cells (beyond today) as not-in-range", () => {
    const cells = contributionCells([today - 7, today], today, 26);
    const active = cells.filter((c) => c.active);
    expect(active.map((c) => c.epochDay).sort((a, b) => a - b)).toEqual([today - 7, today]);
    // Cells after today (rest of the current week) are future.
    const future = cells.filter((c) => c.epochDay > today);
    expect(future.every((c) => c.future)).toBe(true);
    expect(cells.filter((c) => c.epochDay <= today).every((c) => !c.future)).toBe(true);
  });
});
