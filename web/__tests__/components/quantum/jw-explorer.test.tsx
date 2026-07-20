/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("does not assert a phantom Z-string for the default mode-0 view", () => {
    const { container } = render(<JwExplorer source="" />);
    expect(container).not.toHaveTextContent(/q0 through q0/);
    expect(container).toHaveTextContent(/no trailing Z-string/i);
  });

  it("describes the Z-string range for a higher mode", () => {
    const { container } = render(
      <JwExplorer
        source={JSON.stringify({ modes: 4, electrons: 2, mode: 2, dagger: true })}
      />
    );
    expect(container).toHaveTextContent(/q0 through q1/);
  });

  // The convention-critical rendering: a_p^dagger = (X - iY)/2 and
  // a_p = (X + iY)/2. Derived rather than assumed — with |0> empty and |1>
  // occupied, (X - iY)/2 = [[0,0],[1,0]] = |1><0|, which is creation; flip the
  // glyph and the widget teaches that a^dagger is the annihilator, exactly the
  // miseducation it exists to prevent. jw.test.ts pins ySign at the model layer;
  // this pins the last link, the view's mapping of ySign onto the glyph.
  it("renders a MINUS in the creation operator's (X - iY)/2", () => {
    const { container } = render(
      <JwExplorer source={JSON.stringify({ modes: 4, electrons: 2, mode: 0, dagger: true })} />
    );
    expect(container).toHaveTextContent(/\(X\s*[−-]\s*iY\)\s*\/\s*2/);
    expect(container).not.toHaveTextContent(/\(X\s*\+\s*iY\)/);
  });

  it("renders a PLUS in the annihilation operator's (X + iY)/2", () => {
    const { container } = render(
      <JwExplorer source={JSON.stringify({ modes: 4, electrons: 2, mode: 0, dagger: false })} />
    );
    expect(container).toHaveTextContent(/\(X\s*\+\s*iY\)\s*\/\s*2/);
    expect(container).not.toHaveTextContent(/\(X\s*[−-]\s*iY\)/);
  });

  it("names the creation/annihilation toggle pair as a group", () => {
    render(<JwExplorer source="" />);
    expect(
      screen.getByRole("group", { name: /operator type/i })
    ).toBeInTheDocument();
  });

  it("announces the operator when toggled to annihilation", () => {
    render(<JwExplorer source="" />);
    fireEvent.click(screen.getByRole("button", { name: /annihilation/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/annihilation/i);
  });
});
