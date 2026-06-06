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
    expect(isSectionComplete("00-foundations")).toBe(false);
  });

  it("persists completion so a marked section reads back as complete", () => {
    setSectionComplete("00-foundations", true);
    expect(isSectionComplete("00-foundations")).toBe(true);
  });

  it("clears completion when marked incomplete", () => {
    setSectionComplete("00-foundations", true);
    setSectionComplete("00-foundations", false);
    expect(isSectionComplete("00-foundations")).toBe(false);
  });

  it("toggles completion state", () => {
    toggleSectionComplete("01-hardware");
    expect(isSectionComplete("01-hardware")).toBe(true);
    toggleSectionComplete("01-hardware");
    expect(isSectionComplete("01-hardware")).toBe(false);
  });

  it("counts only the completed sections from a list", () => {
    setSectionComplete("a", true);
    setSectionComplete("c", true);
    expect(completedCount(["a", "b", "c", "d"])).toBe(2);
  });

  it("dispatches the shared progress event on write so subscribers update", () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    setSectionComplete("02-algorithms", true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setSectionComplete("02-algorithms", false);
    expect(listener).toHaveBeenCalledTimes(1); // no further calls after unsubscribe
  });

  it("exposes the same event channel the Challenge component uses", () => {
    expect(PROGRESS_EVENT_NAME).toBe("qc-progress");
  });
});
