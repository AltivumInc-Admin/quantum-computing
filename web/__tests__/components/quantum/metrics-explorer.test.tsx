/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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
