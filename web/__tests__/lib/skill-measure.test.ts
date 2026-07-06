/**
 * @jest-environment jsdom
 */
import { betterMeasurement, getBest, recordBest } from "@/lib/skill-measure";

describe("betterMeasurement", () => {
  it("keeps the fewer-gates solution", () => {
    expect(betterMeasurement({ gates: 4 }, { gates: 2 })).toEqual({ gates: 2 });
    expect(betterMeasurement({ gates: 2 }, { gates: 4 })).toEqual({ gates: 2 });
  });
  it("is stable on a tie", () => {
    expect(betterMeasurement({ gates: 3 }, { gates: 3 })).toEqual({ gates: 3 });
  });
});

describe("recordBest / getBest", () => {
  beforeEach(() => localStorage.clear());

  it("records the first measurement", () => {
    recordBest("challenge:a", { gates: 5 });
    expect(getBest("challenge:a")).toEqual({ gates: 5 });
  });

  it("only lowers the best, never raises it", () => {
    recordBest("challenge:a", { gates: 5 });
    recordBest("challenge:a", { gates: 3 }); // improvement
    expect(getBest("challenge:a")).toEqual({ gates: 3 });
    recordBest("challenge:a", { gates: 9 }); // worse — ignored
    expect(getBest("challenge:a")).toEqual({ gates: 3 });
  });

  it("does not rewrite storage when the solve did not improve the best", () => {
    recordBest("challenge:a", { gates: 3 });
    const before = localStorage.getItem("qc:measure:challenge:a");
    recordBest("challenge:a", { gates: 7 });
    expect(localStorage.getItem("qc:measure:challenge:a")).toBe(before);
  });

  it("returns null for an unseen id and for a corrupt record", () => {
    expect(getBest("nope")).toBeNull();
    localStorage.setItem("qc:measure:bad", "{not json");
    expect(getBest("bad")).toBeNull();
    localStorage.setItem("qc:measure:empty", "{}");
    expect(getBest("empty")).toBeNull();
  });

  it("no-ops when storage throws", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("nope");
    };
    expect(() => recordBest("challenge:a", { gates: 2 })).not.toThrow();
    Storage.prototype.setItem = orig;
  });
});
