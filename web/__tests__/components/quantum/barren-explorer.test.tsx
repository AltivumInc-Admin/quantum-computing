/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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
    // Target the legend specifically; the variance readout also mentions
    // "global"/"local", so the bare word would now match multiple elements.
    expect(screen.getByText(/global cost/i)).toBeInTheDocument();
    expect(screen.getByText(/local cost/i)).toBeInTheDocument();
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
});
