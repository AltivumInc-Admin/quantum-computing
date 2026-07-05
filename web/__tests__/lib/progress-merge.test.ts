/**
 * @jest-environment jsdom
 */
import {
  exportSnapshot,
  mergeSnapshots,
  applySnapshot,
} from "@/lib/progress-merge";

const card = (over: Partial<Record<string, number>> = {}) =>
  JSON.stringify({
    reps: 2,
    lapses: 0,
    stability: 6,
    difficulty: 5,
    dueEpochDay: 20600,
    lastEpochDay: 20594,
    ...over,
  });

describe("exportSnapshot", () => {
  beforeEach(() => localStorage.clear());

  it("collects only qc:* keys (sync metadata and foreign keys excluded)", () => {
    localStorage.setItem("qc:section:a", "1");
    localStorage.setItem("qc:card:x", card());
    localStorage.setItem("qc-sync:meta", "{}");
    localStorage.setItem("theme", "dark");
    expect(Object.keys(exportSnapshot()).sort()).toEqual(["qc:card:x", "qc:section:a"]);
  });
});

describe("mergeSnapshots", () => {
  it("takes one-sided keys from either side (additive)", () => {
    expect(mergeSnapshots({ "qc:section:a": "1" }, { "qc:section:b": "1" })).toEqual({
      "qc:section:a": "1",
      "qc:section:b": "1",
    });
  });

  it("picks the more recently REVIEWED CardState as a unit (lastEpochDay)", () => {
    const older = card({ lastEpochDay: 20590, reps: 5 });
    const newer = card({ lastEpochDay: 20594, reps: 1, lapses: 1 });
    expect(mergeSnapshots({ "qc:card:x": older }, { "qc:card:x": newer })["qc:card:x"]).toBe(newer);
    expect(mergeSnapshots({ "qc:card:x": newer }, { "qc:card:x": older })["qc:card:x"]).toBe(newer);
  });

  it("tiebreaks same-day cards on lapses (the only monotonic counter), then reps", () => {
    const a = card({ lapses: 2 });
    const b = card({ lapses: 3 });
    expect(mergeSnapshots({ "qc:card:x": a }, { "qc:card:x": b })["qc:card:x"]).toBe(b);
    const c = card({ reps: 4 });
    expect(mergeSnapshots({ "qc:card:x": card() }, { "qc:card:x": c })["qc:card:x"]).toBe(c);
  });

  it("a corrupt CardState always loses to a valid one", () => {
    const valid = card();
    expect(mergeSnapshots({ "qc:card:x": "{broken" }, { "qc:card:x": valid })["qc:card:x"]).toBe(
      valid
    );
    expect(mergeSnapshots({ "qc:card:x": valid }, { "qc:card:x": "{}" })["qc:card:x"]).toBe(valid);
  });

  it("prefers card-content that can power a live re-mount (kind+source)", () => {
    const plain = JSON.stringify({ prompt: "p", answer: "a" });
    const live = JSON.stringify({ prompt: "p", answer: "a", kind: "challenge", source: "{}" });
    expect(
      mergeSnapshots({ "qc:card-content:x": plain }, { "qc:card-content:x": live })[
        "qc:card-content:x"
      ]
    ).toBe(live);
    expect(
      mergeSnapshots({ "qc:card-content:x": live }, { "qc:card-content:x": plain })[
        "qc:card-content:x"
      ]
    ).toBe(live);
  });

  it("falls back to the local copy for unknown-family differences", () => {
    expect(mergeSnapshots({ "qc:future:x": "a" }, { "qc:future:x": "b" })["qc:future:x"]).toBe("a");
  });
});

describe("applySnapshot", () => {
  beforeEach(() => localStorage.clear());

  it("writes only changed keys, dispatches qc-progress once, returns the count", () => {
    localStorage.setItem("qc:section:a", "1");
    const events: number[] = [];
    const listener = () => events.push(1);
    window.addEventListener("qc-progress", listener);
    const changed = applySnapshot({ "qc:section:a": "1", "qc:card:x": card() });
    window.removeEventListener("qc-progress", listener);
    expect(changed).toBe(1);
    expect(localStorage.getItem("qc:card:x")).toBe(card());
    expect(events).toHaveLength(1);
  });

  it("does not dispatch when nothing changed", () => {
    localStorage.setItem("qc:section:a", "1");
    const events: number[] = [];
    const listener = () => events.push(1);
    window.addEventListener("qc-progress", listener);
    expect(applySnapshot({ "qc:section:a": "1" })).toBe(0);
    window.removeEventListener("qc-progress", listener);
    expect(events).toHaveLength(0);
  });
});
