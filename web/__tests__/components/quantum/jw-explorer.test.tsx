/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { JwExplorer } from "@/components/quantum/jw-explorer";

// jsdom does not implement matchMedia; mirror the markdown-renderer fence-routing
// test so the widget's chrome renders without throwing.
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

describe("JwExplorer", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders the header for an empty source (H2 default)", () => {
    render(<JwExplorer source="" />);
    expect(screen.getByText("Jordan-Wigner mapping")).toBeInTheDocument();
  });

  it("renders the header for a valid JSON source", () => {
    render(
      <JwExplorer
        source={JSON.stringify({ modes: 4, electrons: 2, mode: 1, dagger: false })}
      />
    );
    expect(screen.getByText("Jordan-Wigner mapping")).toBeInTheDocument();
  });

  it("renders the qjw error card for a malformed source without throwing", () => {
    expect(() => render(<JwExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qjw error:/i)).toBeInTheDocument();
  });
});
