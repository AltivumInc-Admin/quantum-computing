/**
 * @jest-environment jsdom
 */
import {
  exportSnapshot,
  mergeSnapshots,
  applySnapshot,
  registerLocalDeletion,
  resetLocalDeletions,
  CLOCK_SKEW_GRACE_DAYS,
} from "@/lib/progress-merge";

const TODAY = 20600;

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

  it("unions Runbook qc:log:day activity flags across devices (no merge rule needed)", () => {
    // The Runbook models each active day as a set-once "1" flag, so it rides the
    // exact additive-union path as section flags — device A's days and device B's
    // days both survive, and a shared day (identical "1") does not conflict.
    const a = { "qc:log:day:20600": "1", "qc:log:day:20601": "1" };
    const b = { "qc:log:day:20601": "1", "qc:log:day:20603": "1" };
    expect(mergeSnapshots(a, b)).toEqual({
      "qc:log:day:20600": "1",
      "qc:log:day:20601": "1",
      "qc:log:day:20603": "1",
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

  it("resolves unknown-family differences symmetrically (lexicographic)", () => {
    expect(mergeSnapshots({ "qc:future:x": "a" }, { "qc:future:x": "b" })["qc:future:x"]).toBe("b");
    expect(mergeSnapshots({ "qc:future:x": "b" }, { "qc:future:x": "a" })["qc:future:x"]).toBe("b");
  });

  it("is COMMUTATIVE on every genuine tie, so the two-device protocol converges", () => {
    // The exact non-convergence repro: same card graded 'good' on A and 'hard'
    // on B the same day — lastEpochDay, lapses, and reps all tie, values differ.
    const good = card({ reps: 3, lapses: 1, lastEpochDay: 20594, dueEpochDay: 20606 });
    const hard = card({ reps: 3, lapses: 1, lastEpochDay: 20594, dueEpochDay: 20601 });
    const liveA = JSON.stringify({ prompt: "p", answer: "a", kind: "challenge", source: "A" });
    const liveB = JSON.stringify({ prompt: "p", answer: "a", kind: "challenge", source: "B" });
    const a = { "qc:card:x": good, "qc:card-content:x": liveA, "qc:future:x": "va" };
    const b = { "qc:card:x": hard, "qc:card-content:x": liveB, "qc:future:x": "vb" };
    expect(mergeSnapshots(a, b, TODAY)).toEqual(mergeSnapshots(b, a, TODAY));
  });

  it("quarantines clock-skewed cards: an implausibly future copy loses to any plausible one", () => {
    // A device with a year-fast clock graded this card "more recently" — forever.
    const poisoned = card({ lastEpochDay: TODAY + 366, dueEpochDay: TODAY + 372, reps: 9 });
    const legit = card({ lastEpochDay: TODAY - 1, dueEpochDay: TODAY + 5 });
    expect(
      mergeSnapshots({ "qc:card:x": legit }, { "qc:card:x": poisoned }, TODAY)["qc:card:x"]
    ).toBe(legit);
    expect(
      mergeSnapshots({ "qc:card:x": poisoned }, { "qc:card:x": legit }, TODAY)["qc:card:x"]
    ).toBe(legit);
    // Within the grace window (UTC-boundary grading) recency still wins.
    const nearFuture = card({
      lastEpochDay: TODAY + CLOCK_SKEW_GRACE_DAYS,
      dueEpochDay: TODAY + CLOCK_SKEW_GRACE_DAYS + 6,
    });
    expect(
      mergeSnapshots({ "qc:card:x": legit }, { "qc:card:x": nearFuture }, TODAY)["qc:card:x"]
    ).toBe(nearFuture);
  });

  it("quarantines a corrupt dueEpochDay (plausible lastEpochDay, absurd due) that would freeze the card", () => {
    // isDue is dueEpochDay <= today, so a card 100 years out never comes due —
    // it would be frozen from review. The real scheduler can never produce
    // dueEpochDay > lastEpochDay + MAX_INTERVAL (365).
    const frozen = card({ lastEpochDay: TODAY - 1, dueEpochDay: TODAY + 40000, reps: 9 });
    const legit = card({ lastEpochDay: TODAY - 1, dueEpochDay: TODAY + 5 });
    expect(
      mergeSnapshots({ "qc:card:x": legit }, { "qc:card:x": frozen }, TODAY)["qc:card:x"]
    ).toBe(legit);
    // A legal long interval (up to a year out) is NOT quarantined.
    const legitLong = card({ lastEpochDay: TODAY, dueEpochDay: TODAY + 365 });
    expect(
      mergeSnapshots({ "qc:card:x": legit }, { "qc:card:x": legitLong }, TODAY)["qc:card:x"]
    ).toBe(legitLong); // more recent lastEpochDay wins, not quarantined
  });

  it("keeps tombstoned keys IN the merged snapshot (the push must preserve the server copy)", () => {
    // If the tombstone removed the key from the push, that "local-only"
    // deletion would delete server-side and flip-flop forever against a
    // device that still holds it (confirmed non-convergence).
    resetLocalDeletions();
    registerLocalDeletion("qc:section:undone");
    const merged = mergeSnapshots({}, { "qc:section:undone": "1", "qc:section:other": "1" });
    expect(merged).toEqual({ "qc:section:undone": "1", "qc:section:other": "1" });
    resetLocalDeletions();
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

  it("refuses to write a clock-skewed CardState even from an already-poisoned snapshot", () => {
    const poisoned = card({ lastEpochDay: TODAY + 366 });
    expect(applySnapshot({ "qc:card:x": poisoned }, TODAY)).toBe(0);
    expect(localStorage.getItem("qc:card:x")).toBeNull();
  });

  it("refuses to write a card with a corrupt (frozen) dueEpochDay", () => {
    const frozen = card({ lastEpochDay: TODAY - 1, dueEpochDay: TODAY + 40000 });
    expect(applySnapshot({ "qc:card:x": frozen }, TODAY)).toBe(0);
    expect(localStorage.getItem("qc:card:x")).toBeNull();
  });
});

describe("un-complete does not self-revert (progress-store tombstone wiring)", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLocalDeletions();
  });

  it("a section toggled off stays off locally through a subsequent merge-apply", async () => {
    // The exact repro: un-complete -> 20s later the debounced sync pulls the
    // server's "1" back and the checkbox flips on under the learner's click.
    // The tombstone gates the LOCAL apply only; the merged (pushed) snapshot
    // still carries the server copy so other devices never see a deletion.
    const { setSectionComplete } = await import("@/lib/progress-store");
    setSectionComplete("qubits", true);
    setSectionComplete("qubits", false); // registers the session tombstone
    const merged = mergeSnapshots(exportSnapshot(), { "qc:section:qubits": "1" });
    expect(merged["qc:section:qubits"]).toBe("1"); // preserved for the push
    expect(applySnapshot(merged)).toBe(0); // but never rewritten locally
    expect(localStorage.getItem("qc:section:qubits")).toBeNull();
    // Re-completing clears the tombstone so the flag applies + syncs again.
    setSectionComplete("qubits", true);
    expect(localStorage.getItem("qc:section:qubits")).toBe("1");
  });
});
