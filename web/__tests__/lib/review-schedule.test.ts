import {
  newCard,
  schedule,
  isDue,
  epochDay,
  nextIntervalDays,
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  MAX_INTERVAL,
  type CardState,
  type Rating,
} from "@/lib/review-schedule";

const T0 = 0; // epoch-day zero; the scheduler is clock-injected so this is arbitrary

describe("review-schedule", () => {
  it("epochDay floors milliseconds to whole days", () => {
    expect(epochDay(0)).toBe(0);
    expect(epochDay(86_400_000 - 1)).toBe(0);
    expect(epochDay(86_400_000)).toBe(1);
    expect(epochDay(3 * 86_400_000 + 5)).toBe(3);
  });

  it("a passing review never shortens the interval (SM-2 monotonicity)", () => {
    // "Easy" first review graduates to stability 4; a passing "hard" graduating
    // step (3) must not regress below it.
    const afterEasy = schedule(newCard(T0), "easy", T0);
    expect(afterEasy.stability).toBe(4);
    for (const r of ["hard", "good", "easy"] as Rating[]) {
      const next = schedule(afterEasy, r, afterEasy.dueEpochDay);
      expect(next.stability).toBeGreaterThanOrEqual(afterEasy.stability);
    }
  });

  it("a new card is due immediately and unreviewed", () => {
    const c = newCard(T0);
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(0);
    expect(isDue(c, T0)).toBe(true);
  });

  it("successive Good reviews produce strictly increasing intervals", () => {
    let c = newCard(T0);
    const intervals: number[] = [];
    let today = T0;
    for (let i = 0; i < 4; i++) {
      c = schedule(c, "good", today);
      intervals.push(nextIntervalDays(c));
      today = c.dueEpochDay; // review exactly when due
    }
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
  });

  it("Again resets the interval to one day and increments lapses", () => {
    let c = newCard(T0);
    c = schedule(c, "good", T0);
    c = schedule(c, "good", c.dueEpochDay); // mature the card
    const beforeLapses = c.lapses;
    const failed = schedule(c, "again", c.dueEpochDay);
    expect(nextIntervalDays(failed)).toBe(1);
    expect(failed.reps).toBe(0);
    expect(failed.lapses).toBe(beforeLapses + 1);
  });

  it("Easy graduates faster than Good, which is faster than Hard", () => {
    const fresh = (): CardState => newCard(T0);
    const hard = schedule(fresh(), "hard", T0);
    const good = schedule(fresh(), "good", T0);
    const easy = schedule(fresh(), "easy", T0);
    expect(nextIntervalDays(easy)).toBeGreaterThanOrEqual(nextIntervalDays(good));
    expect(nextIntervalDays(good)).toBeGreaterThanOrEqual(nextIntervalDays(hard));
  });

  it("difficulty stays within bounds under repeated extreme grades", () => {
    let hardCard = newCard(T0);
    let easyCard = newCard(T0);
    let today = T0;
    for (let i = 0; i < 25; i++) {
      hardCard = schedule(hardCard, "again", today);
      easyCard = schedule(easyCard, "easy", today);
      today += 1;
    }
    expect(hardCard.difficulty).toBe(MAX_DIFFICULTY);
    expect(easyCard.difficulty).toBe(MIN_DIFFICULTY);
  });

  it("intervals never exceed the maximum", () => {
    let c = newCard(T0);
    let today = T0;
    for (let i = 0; i < 40; i++) {
      c = schedule(c, "easy", today);
      today = c.dueEpochDay;
      expect(nextIntervalDays(c)).toBeLessThanOrEqual(MAX_INTERVAL);
    }
  });

  it("isDue is false before the due day and true on/after it", () => {
    const c = schedule(newCard(T0), "good", T0);
    expect(isDue(c, c.dueEpochDay - 1)).toBe(false);
    expect(isDue(c, c.dueEpochDay)).toBe(true);
    expect(isDue(c, c.dueEpochDay + 5)).toBe(true);
  });

  it("is a pure function of its inputs", () => {
    const c = newCard(T0);
    const ratings: Rating[] = ["again", "hard", "good", "easy"];
    for (const r of ratings) {
      expect(schedule(c, r, T0)).toEqual(schedule(c, r, T0));
    }
  });

  // Two on-time Good reviews leave the card mature (reps === 2), so the next
  // review takes the mature (overdue-crediting) branch.
  const mature = (): CardState => {
    let c = newCard(T0);
    c = schedule(c, "good", T0);
    c = schedule(c, "good", c.dueEpochDay);
    return c;
  };

  it("credits overdue time: a long-overdue Good beats an on-time Good", () => {
    const c = mature();
    const onTime = schedule(c, "good", c.dueEpochDay);
    const overdue = schedule(c, "good", c.dueEpochDay + 90);
    expect(overdue.stability).toBeGreaterThan(onTime.stability);
    expect(nextIntervalDays(overdue)).toBeGreaterThan(nextIntervalDays(onTime));
  });

  it("does not penalize an early review (elapsed clamps to 0)", () => {
    const c = mature();
    const early = schedule(c, "good", c.dueEpochDay - 3);
    const onTime = schedule(c, "good", c.dueEpochDay);
    expect(early.stability).toBe(onTime.stability);
  });

  it("overdue growth still respects MAX_INTERVAL and monotonicity", () => {
    const c = mature();
    const result = schedule(c, "easy", c.dueEpochDay + 10_000);
    expect(nextIntervalDays(result)).toBeLessThanOrEqual(MAX_INTERVAL);
    expect(result.stability).toBeGreaterThanOrEqual(c.stability);
  });

  it("a lapse ignores overdue time (resets to one day)", () => {
    const c = mature();
    const failed = schedule(c, "again", c.dueEpochDay + 90);
    expect(nextIntervalDays(failed)).toBe(1);
    expect(failed.lapses).toBe(c.lapses + 1);
  });
});
