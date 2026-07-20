/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BarrenExplorer } from "@/components/quantum/barren-explorer";

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((q: string) => ({
    matches: reduced, media: q, onchange: null,
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn(),
  }));
}

describe("BarrenExplorer", () => {
  beforeEach(() => mockMatchMedia(false));
  it("renders the Barren plateaus header and both cost legends", () => {
    render(<BarrenExplorer source={JSON.stringify({ depth: 2, samples: 120 })} />);
    expect(screen.getByText(/barren plateaus/i)).toBeInTheDocument();
    // Target the legend specifically; the variance readout and the callout also
    // mention "global"/"local cost", so a bare word (or even "local cost") now
    // matches multiple elements — the parenthesized dash pattern is unique to
    // the legend swatches.
    expect(screen.getByText(/global cost \(solid\)/i)).toBeInTheDocument();
    expect(screen.getByText(/local cost \(dashed\)/i)).toBeInTheDocument();
  });
  it("rejects malformed JSON with the example-shaped error", () => {
    render(<BarrenExplorer source={"{not json"} />);
    expect(screen.getByText(/expected JSON like \{ "depth": 2, "samples": 400 \}/)).toBeInTheDocument();
  });
  it("rejects a non-object source", () => {
    render(<BarrenExplorer source={"[1]"} />);
    expect(screen.getByText(/expected a JSON object/)).toBeInTheDocument();
  });
  it("rejects an out-of-range depth with the exact error", () => {
    render(<BarrenExplorer source={JSON.stringify({ depth: 9 })} />);
    expect(screen.getByText(/depth must be an integer in 1\.\.5 \(got 9\)/)).toBeInTheDocument();
  });
  it("rejects out-of-range samples with the exact error", () => {
    render(<BarrenExplorer source={JSON.stringify({ samples: 5 })} />);
    expect(screen.getByText(/samples must be a number in 10\.\.2000 \(got 5\)/)).toBeInTheDocument();
  });
  it("distinguishes the two curves by dash pattern, not hue alone (WCAG 1.4.1)", () => {
    const { container } = render(
      <BarrenExplorer source={JSON.stringify({ depth: 2, samples: 40 })} />
    );
    const dashed = container.querySelectorAll('polyline[stroke-dasharray="6 3"]');
    expect(dashed).toHaveLength(1); // the local-cost curve
    expect(screen.getByText(/global cost \(solid\)/i)).toBeInTheDocument();
    expect(screen.getByText(/local cost \(dashed\)/i)).toBeInTheDocument();
  });
  it("renders decade ticks with a raised exponent, so 10^0 never reads as '100'", () => {
    const { container } = render(
      <BarrenExplorer source={JSON.stringify({ depth: 2, samples: 40 })} />
    );
    const tspans = Array.from(container.querySelectorAll("text > tspan"));
    expect(tspans.length).toBeGreaterThan(0);
    // Every decade sits in its own raised tspan rather than inline after "10".
    for (const t of tspans) expect(t.getAttribute("dy")).toBe("-2.5");
    expect(tspans.map((t) => t.textContent)).toContain("0");
  });
  it("moving the depth slider recomputes the variance readout", () => {
    render(<BarrenExplorer source={JSON.stringify({ depth: 1, samples: 40 })} />);
    const before = screen.getByRole("status").textContent;
    act(() => {
      fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
    });
    const status = screen.getByRole("status");
    expect(status.textContent).not.toEqual(before);
    // Once the deferred sweep settles, no surface is left flagged stale.
    expect(status).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("img")).toHaveAttribute("aria-busy", "false");
  });
});
