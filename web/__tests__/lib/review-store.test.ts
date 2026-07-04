/**
 * @jest-environment jsdom
 */
import {
  getCardState,
  gradeCard,
  gradeCardIfDue,
  getAllCardIds,
  dueCardIds,
  dueCount,
  subscribe,
  PROGRESS_EVENT_NAME,
} from "@/lib/review-store";

const DAY = 86_400_000;

describe("review-store", () => {
  beforeEach(() => localStorage.clear());

  it("returns null for a card that has never been reviewed", () => {
    expect(getCardState("found-superposition-1")).toBeNull();
  });

  it("discards a corrupt-but-valid-JSON record instead of poisoning the schedule", () => {
    localStorage.setItem("qc:card:a", "{}"); // valid JSON, semantically broken
    expect(getCardState("a")).toBeNull();
    const next = gradeCard("a", "good", 0); // falls back to a fresh card
    expect(next.reps).toBe(1);
    expect(Number.isFinite(next.stability)).toBe(true);
    expect(Number.isFinite(next.dueEpochDay)).toBe(true);
  });

  it("persists a graded card so its state reads back", () => {
    const state = gradeCard("found-superposition-1", "good", 0);
    expect(state.reps).toBe(1);
    const reloaded = getCardState("found-superposition-1");
    expect(reloaded).toEqual(state);
  });

  it("lists only reviewed card ids", () => {
    gradeCard("a", "good", 0);
    gradeCard("b", "again", 0);
    expect(getAllCardIds().sort()).toEqual(["a", "b"]);
  });

  it("counts a card as due only once its due day arrives", () => {
    // Grade "Good" at day 0 -> first interval is 1 day, due at day 1.
    gradeCard("a", "good", 0);
    expect(dueCount(0)).toBe(0); // not yet due
    expect(dueCardIds(0)).toEqual([]);
    expect(dueCount(1 * DAY)).toBe(1); // due on day 1
    expect(dueCardIds(1 * DAY)).toEqual(["a"]);
    expect(dueCount(9 * DAY)).toBe(1); // still due later
  });

  it("a lapsed card is due again the next day", () => {
    gradeCard("a", "again", 5 * DAY); // due day 6
    expect(dueCount(5 * DAY)).toBe(0);
    expect(dueCount(6 * DAY)).toBe(1);
  });

  it("broadcasts the shared progress event on grade", () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    gradeCard("a", "good", 0);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    gradeCard("a", "good", DAY);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("uses the same channel name as the rest of the progress system", () => {
    expect(PROGRESS_EVENT_NAME).toBe("qc-progress");
  });

  it("does not throw when storage writes fail", () => {
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => gradeCard("a", "good", 0)).not.toThrow();
    spy.mockRestore();
  });

  describe("gradeCardIfDue", () => {
    it("creates a card when none exists yet", () => {
      const s = gradeCardIfDue("x", "good", 0);
      expect(s).not.toBeNull();
      expect(s!.reps).toBe(1);
      expect(getCardState("x")).toEqual(s);
    });

    it("is a no-op while the card is not yet due (returns null, no advance)", () => {
      gradeCardIfDue("x", "good", 0); // due at day 1
      const skipped = gradeCardIfDue("x", "good", 0); // same day, not due
      expect(skipped).toBeNull();
      expect(getCardState("x")!.reps).toBe(1); // unchanged
    });

    it("advances the schedule once the card is due again", () => {
      gradeCardIfDue("x", "good", 0); // reps 1, due day 1
      const advanced = gradeCardIfDue("x", "good", 1 * DAY);
      expect(advanced).not.toBeNull();
      expect(advanced!.reps).toBe(2);
    });
  });
});
