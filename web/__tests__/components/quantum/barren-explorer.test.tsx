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
    expect(screen.getByText(/global/i)).toBeInTheDocument();
    expect(screen.getByText(/local/i)).toBeInTheDocument();
  });
});
