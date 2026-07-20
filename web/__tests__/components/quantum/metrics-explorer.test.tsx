/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { MetricsExplorer } from "@/components/quantum/metrics-explorer";

// jsdom does not implement matchMedia; the widget's reduced-motion handling
// (usePrefersReducedMotion) probes it, so mock it defensively the same way
// markdown-renderer.fence-routing.test.tsx does.
function mockMatchMedia(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

describe("MetricsExplorer", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders the header with an empty source (defaults to equilibrium)", () => {
    render(<MetricsExplorer source="" />);
    expect(screen.getByText("Live job metrics")).toBeInTheDocument();
  });

  it("renders the header with a valid JSON source", () => {
    render(
      <MetricsExplorer source={JSON.stringify({ R: 0.74, threshold: -1.13 })} />
    );
    expect(screen.getByText("Live job metrics")).toBeInTheDocument();
  });

  it("renders the qmetrics error card on a malformed source without throwing", () => {
    expect(() => render(<MetricsExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qmetrics error:/)).toBeInTheDocument();
  });

  it("shows 'ready' chip at idle, not 'running'", () => {
    render(<MetricsExplorer source="" />);
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.queryByText("running")).not.toBeInTheDocument();
  });

  it("Stream button is initially enabled", () => {
    render(<MetricsExplorer source="" />);
    const btn = screen.getByRole("button", { name: /stream/i });
    expect(btn).not.toBeDisabled();
  });

  /**
   * The Stream control is the only timer + multi-state machine in F11, and two
   * prior audit rounds shipped fixes straight into it (the re-click guard and
   * the timer teardown) with nothing locking either: the suite had no click at
   * all. These cases pin the state machine end to end so a regression that
   * restarts the run on re-click, leaks the setTimeout chain past unmount, or
   * breaks the reduced-motion instant reveal cannot ship green.
   */
  describe("Stream state machine", () => {
    const STREAM_MS = 60;
    // vqeGradientDescent returns the starting energy plus one per step, so the
    // history is STEPS + 1 = 41 points long.
    const TOTAL = 41;

    /** Number of points currently drawn on the revealed metric line. */
    function shownPoints(): number {
      const d = document
        .querySelector('[data-testid="metric-line"]')
        ?.getAttribute("d");
      if (!d) return 0;
      return d.split("L").length; // "M x,y L x,y L …" -> segments + 1
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    function clickStream() {
      fireEvent.click(screen.getByRole("button", { name: /stream/i }));
    }

    it("streams the curve point by point, then settles on a terminal tol verdict", () => {
      render(<MetricsExplorer source="" />);
      expect(screen.getByText("ready")).toBeInTheDocument();

      clickStream();
      expect(screen.getByText("running")).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(STREAM_MS * 5);
      });
      const partial = shownPoints();
      expect(partial).toBeGreaterThan(1);
      expect(partial).toBeLessThan(TOTAL);
      expect(screen.getByText("running")).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(STREAM_MS * TOTAL);
      });
      expect(shownPoints()).toBe(TOTAL);
      expect(screen.queryByText("running")).not.toBeInTheDocument();
      // "tol met" / "tol not met" — never the raw "stopped" enum, and never
      // Braket's stopping_condition, which takes maxRuntimeInSeconds only and
      // has no metric-threshold form. (The caption still names the real API to
      // teach the split; the verdict chip must not borrow it.)
      expect(screen.getByText(/^tol (not )?met$/)).toBeInTheDocument();
      expect(screen.queryByText("stopping_condition met")).not.toBeInTheDocument();
      expect(screen.queryByText("stopped")).not.toBeInTheDocument();
    });

    it("attributes the halt correctly: tol is in-script, stopping_condition is the runtime cap", () => {
      render(<MetricsExplorer source="" />);
      expect(screen.getByText(/maxRuntimeInSeconds/)).toBeInTheDocument();
    });

    it("ignores a re-click mid-stream instead of rewinding the run", () => {
      render(<MetricsExplorer source="" />);
      clickStream();
      act(() => {
        jest.advanceTimersByTime(STREAM_MS * 8);
      });
      const before = shownPoints();

      clickStream(); // the timerRef guard must swallow this
      act(() => {
        jest.advanceTimersByTime(STREAM_MS);
      });
      expect(shownPoints()).toBeGreaterThanOrEqual(before);
    });

    it("stays focusable while streaming (the button must not disable itself)", () => {
      render(<MetricsExplorer source="" />);
      const btn = screen.getByRole("button", { name: /stream/i });
      btn.focus();
      fireEvent.click(btn);
      act(() => {
        jest.advanceTimersByTime(STREAM_MS * 2);
      });
      expect(btn).not.toBeDisabled();
      expect(btn).toHaveAttribute("aria-disabled", "true");
      expect(document.activeElement).toBe(btn);
    });

    it("leaves no pending timer when unmounted mid-stream", () => {
      const { unmount } = render(<MetricsExplorer source="" />);
      clickStream();
      act(() => {
        jest.advanceTimersByTime(STREAM_MS * 3);
      });
      expect(jest.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(jest.getTimerCount()).toBe(0);
    });

    it("returns to 'ready' when the run changes mid-stream (no stuck 'Streaming…')", () => {
      const { rerender } = render(<MetricsExplorer source="" />);
      clickStream();
      act(() => {
        jest.advanceTimersByTime(STREAM_MS * 3);
      });
      expect(screen.getByText("running")).toBeInTheDocument();

      rerender(<MetricsExplorer source={JSON.stringify({ R: 0.9 })} />);
      expect(screen.getByText("ready")).toBeInTheDocument();
      const btn = screen.getByRole("button", { name: /stream/i });
      expect(btn).not.toHaveAttribute("aria-disabled");
      expect(btn).toHaveTextContent("Stream");
    });

    it("reveals the full curve immediately under reduced motion, with no timer", () => {
      mockMatchMedia(true);
      render(<MetricsExplorer source="" />);
      clickStream();
      expect(shownPoints()).toBe(TOTAL);
      expect(jest.getTimerCount()).toBe(0);
      expect(screen.queryByText("running")).not.toBeInTheDocument();
    });

    it("announces the rewind when Reset is activated", () => {
      render(<MetricsExplorer source="" />);
      // Silent on first mount — nothing has happened yet.
      expect(screen.getByRole("status")).toHaveTextContent("");
      clickStream();
      act(() => {
        jest.advanceTimersByTime(STREAM_MS * 3);
      });
      fireEvent.click(screen.getByRole("button", { name: /reset/i }));
      expect(screen.getByRole("status")).toHaveTextContent(/reset/i);
    });
  });

  it("derives the y-axis from the data, so an out-of-band threshold doesn't rescale it", () => {
    // The plot's aria-label encodes the y-range; with the fix it depends on the
    // VQE data only, not the user threshold.
    const yRange = (threshold: number) => {
      const { container, unmount } = render(
        <MetricsExplorer source={JSON.stringify({ R: 0.74, threshold })} />
      );
      const aria =
        container.querySelector('[aria-label*="energy from"]')?.getAttribute("aria-label") ?? "";
      const m = aria.match(/energy from ([\d.-]+) hartree to ([\d.-]+) hartree/);
      unmount();
      return m ? `${m[1]}..${m[2]}` : null;
    };
    const inBand = yRange(-1.13);
    expect(inBand).toBeTruthy();
    expect(yRange(5)).toBe(inBand); // a wildly out-of-band threshold must not change the y-extent
  });
});
