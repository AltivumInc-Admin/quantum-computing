/**
 * @jest-environment jsdom
 */
import { recordActivity, activeDays } from "@/lib/activity-log";
import { epochDay } from "@/lib/review-schedule";

describe("activity-log", () => {
  beforeEach(() => localStorage.clear());

  it("records today as a set-once qc:log:day flag", () => {
    const now = 1_700_000_000_000;
    recordActivity(now);
    const day = epochDay(now);
    expect(localStorage.getItem(`qc:log:day:${day}`)).toBe("1");
    expect(activeDays()).toEqual([day]);
  });

  it("is idempotent within a day and accumulates across days", () => {
    const d0 = 1_700_000_000_000;
    const d1 = d0 + 86_400_000;
    recordActivity(d0);
    recordActivity(d0); // same day again — still one flag
    recordActivity(d1);
    expect(activeDays().sort((a, b) => a - b)).toEqual([epochDay(d0), epochDay(d1)]);
  });

  it("does NOT dispatch qc-progress itself (the calling writer owns that)", () => {
    const events: number[] = [];
    const listener = () => events.push(1);
    window.addEventListener("qc-progress", listener);
    recordActivity(1_700_000_000_000);
    window.removeEventListener("qc-progress", listener);
    expect(events).toHaveLength(0);
  });

  it("reads back only qc:log:day keys, ignoring other qc:* families", () => {
    recordActivity(1_700_000_000_000);
    localStorage.setItem("qc:card:x", "{}");
    localStorage.setItem("qc:section:a", "1");
    expect(activeDays()).toEqual([epochDay(1_700_000_000_000)]);
  });

  it("no-ops when storage throws (private mode / SSR)", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("nope");
    };
    expect(() => recordActivity(1_700_000_000_000)).not.toThrow();
    Storage.prototype.setItem = orig;
  });
});
