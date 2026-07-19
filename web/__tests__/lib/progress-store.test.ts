/**
 * @jest-environment jsdom
 */
import {
  isSectionComplete,
  setSectionComplete,
  toggleSectionComplete,
  completedCount,
  subscribe,
  PROGRESS_EVENT_NAME,
} from "@/lib/progress-store";

describe("progress-store", () => {
  beforeEach(() => localStorage.clear());

  it("reports an unmarked section as incomplete", () => {
    expect(isSectionComplete("01-foundations")).toBe(false);
  });

  it("persists completion so a marked section reads back as complete", () => {
    setSectionComplete("01-foundations", true);
    expect(isSectionComplete("01-foundations")).toBe(true);
  });

  it("clears completion when marked incomplete", () => {
    setSectionComplete("01-foundations", true);
    setSectionComplete("01-foundations", false);
    expect(isSectionComplete("01-foundations")).toBe(false);
  });

  it("toggles completion state", () => {
    toggleSectionComplete("02-hardware");
    expect(isSectionComplete("02-hardware")).toBe(true);
    toggleSectionComplete("02-hardware");
    expect(isSectionComplete("02-hardware")).toBe(false);
  });

  it("counts only the completed sections from a list", () => {
    setSectionComplete("a", true);
    setSectionComplete("c", true);
    expect(completedCount(["a", "b", "c", "d"])).toBe(2);
  });

  it("dispatches the shared progress event on write so subscribers update", () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    setSectionComplete("03-algorithms", true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setSectionComplete("03-algorithms", false);
    expect(listener).toHaveBeenCalledTimes(1); // no further calls after unsubscribe
  });

  it("owns the qc-progress channel name the Rep widgets and stores import", () => {
    expect(PROGRESS_EVENT_NAME).toBe("qc-progress");
  });

  it("ignores cross-tab storage writes to unrelated keys", () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "pyodide-cache" }));
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("reacts to cross-tab storage writes to its own keys and to a full clear", () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "qc:section:01-foundations" })
    );
    window.dispatchEvent(new StorageEvent("storage", { key: null })); // localStorage.clear()
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  describe("blocked storage (site data off) degrades to an in-memory session", () => {
    // The header's promise is "progress just isn't remembered this session" —
    // NOT a dead control. With every localStorage access throwing, the toggle
    // must still flip, notify subscribers, and count.
    let spies: jest.SpyInstance[];
    beforeEach(() => {
      const blocked = () => {
        throw new Error("blocked");
      };
      spies = (["getItem", "setItem", "removeItem"] as const).map((m) =>
        jest.spyOn(Storage.prototype, m).mockImplementation(blocked)
      );
    });
    afterEach(() => spies.forEach((s) => s.mockRestore()));

    it("still completes, un-completes, counts, and notifies for the session", () => {
      const listener = jest.fn();
      const unsubscribe = subscribe(listener);
      setSectionComplete("blocked-a", true);
      expect(isSectionComplete("blocked-a")).toBe(true);
      expect(completedCount(["blocked-a", "blocked-b"])).toBe(1);
      expect(listener).toHaveBeenCalledTimes(1);
      setSectionComplete("blocked-a", false);
      expect(isSectionComplete("blocked-a")).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it("reads a never-written section as incomplete", () => {
      expect(isSectionComplete("blocked-never")).toBe(false);
    });
  });
});
