import {
  weekOf,
  weekdayMon,
  weekStartDay,
  streak,
  masteryCount,
  masteredThisWeek,
  freezesEarned,
  contributionCells,
  retentionSpectrum,
  daysUntilNextDue,
  dueRetained,
  RETENTION_BINS,
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

describe("retentionSpectrum", () => {
  const at = (stability: number) => card({ stability });

  it("buckets each card's stability into the eight bins", () => {
    const states = [at(1), at(3), at(3), at(7), at(20), at(21), at(60), at(365)];
    const s = retentionSpectrum(states);
    // bins: [1] [2–3] [4–7] [8–20] ‖ [21–45] [46–90] [91–180] [181–365]
    expect(s.bins.map((b) => b.count)).toEqual([1, 2, 1, 1, 1, 1, 0, 1]);
    expect(s.bins.map((b) => b.label)).toEqual(RETENTION_BINS.map((b) => b.label));
  });

  it("splits maturing (LEFT of the 21d line) from retained (AT/right of it)", () => {
    const states = [at(1), at(20), at(21), at(45), at(200)];
    const s = retentionSpectrum(states);
    // Only the bins at/above 21 are the accent (retained) side.
    expect(s.bins.filter((b) => b.retained).map((b) => b.lo)).toEqual([21, 46, 91, 181]);
    expect(s.maturing).toBe(2); // stability 1, 20
    expect(s.retained).toBe(3); // stability 21, 45, 200
    expect(s.tracked).toBe(5);
  });

  it("tracked always equals maturing + retained (the footer can never fail to add up)", () => {
    const states = [at(2), at(5), at(21), at(21), at(90), at(300)];
    const s = retentionSpectrum(states);
    expect(s.tracked).toBe(s.maturing + s.retained);
  });

  // The invariant the whole instrument rests on: the accent mass is EXACTLY the
  // North-Star number. If these two ever diverge the chart is lying.
  it("INVARIANT: the retained mass equals masteryCount over the same states", () => {
    const states = [at(1), at(8), at(20), at(21), at(21), at(46), at(365), at(19)];
    expect(retentionSpectrum(states).retained).toBe(masteryCount(states));
  });

  it("is empty and adds to zero for no cards", () => {
    const s = retentionSpectrum([]);
    expect(s.tracked).toBe(0);
    expect(s.bins.every((b) => b.count === 0)).toBe(true);
  });
});

describe("daysUntilNextDue (NOT nextIntervalDays — the trap)", () => {
  it("measures from TODAY over the not-yet-due cards, taking the soonest", () => {
    const today = 100;
    const states = [
      card({ dueEpochDay: 103, lastEpochDay: 90 }), // due in 3 (last interval was 13)
      card({ dueEpochDay: 108, lastEpochDay: 100 }),
      card({ dueEpochDay: 95 }), // already due — excluded
    ];
    // The last SCHEDULED interval of the soonest card is 13; the answer is 3 (from today).
    expect(daysUntilNextDue(states, today)).toBe(3);
  });

  it("returns null when every card is already due", () => {
    expect(daysUntilNextDue([card({ dueEpochDay: 90 }), card({ dueEpochDay: 100 })], 100)).toBeNull();
  });

  it("returns null for no cards", () => {
    expect(daysUntilNextDue([], 100)).toBeNull();
  });
});

describe("dueRetained", () => {
  it("counts cards that are due AND in proven retention (an 'Again' resets them)", () => {
    const today = 100;
    const states = [
      card({ dueEpochDay: 99, stability: 40 }), // due + retained ✓
      card({ dueEpochDay: 100, stability: 21 }), // due + retained ✓
      card({ dueEpochDay: 100, stability: 5 }), // due but maturing ✗
      card({ dueEpochDay: 110, stability: 60 }), // retained but not due ✗
    ];
    expect(dueRetained(states, today)).toBe(2);
  });
});
