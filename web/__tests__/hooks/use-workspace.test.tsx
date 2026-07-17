/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useWorkspace } from "@/hooks/use-workspace";
import { recordBest } from "@/lib/skill-measure";
import { setCardContent } from "@/lib/review-store";

/**
 * The snapshot-key regression: useWorkspace's external-store snapshot must
 * include the qc:measure store, or the Records zone renders stale personal
 * bests until an UNRELATED store (a grade, a section flag) happens to change.
 * Every qc-progress dispatch below touches ONLY the measurement store.
 */
describe("useWorkspace — measurement store invalidation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("a NEW personal best appears in records on the next qc-progress", () => {
    const { result } = renderHook(() => useWorkspace());
    expect(result.current?.records).toEqual([]);

    act(() => {
      setCardContent("challenge:bell", {
        prompt: "Build a Bell pair",
        answer: "",
        kind: "challenge",
      });
      recordBest("challenge:bell", { gates: 4 });
      window.dispatchEvent(new Event("qc-progress"));
    });

    expect(result.current?.records).toEqual([
      { id: "challenge:bell", title: "Build a Bell pair", gates: 4 },
    ]);
  });

  it("an IMPROVED best (same card, fewer gates) refreshes live", () => {
    setCardContent("challenge:bell", {
      prompt: "Build a Bell pair",
      answer: "",
      kind: "challenge",
    });
    recordBest("challenge:bell", { gates: 4 });
    const { result } = renderHook(() => useWorkspace());
    expect(result.current?.records).toEqual([expect.objectContaining({ gates: 4 })]);

    // The count of measurements is unchanged — only the gates minimum moves,
    // so this catches a snapshot that keys on count alone.
    act(() => {
      recordBest("challenge:bell", { gates: 2 });
      window.dispatchEvent(new Event("qc-progress"));
    });

    expect(result.current?.records).toEqual([expect.objectContaining({ gates: 2 })]);
  });
});
