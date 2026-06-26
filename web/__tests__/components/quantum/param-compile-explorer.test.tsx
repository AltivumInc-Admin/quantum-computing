/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ParamCompileExplorer } from "@/components/quantum/param-compile-explorer";

// jsdom does not implement matchMedia; the widget's reduced-motion hook needs it.
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

describe("ParamCompileExplorer", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders the Parametric compilation header with an empty source (defaults)", () => {
    render(<ParamCompileExplorer source="" />);
    expect(screen.getByText("Parametric compilation")).toBeInTheDocument();
  });

  it("renders the Parametric compilation header for a valid JSON source", () => {
    render(
      <ParamCompileExplorer
        source={JSON.stringify({ iterations: 50, compileSec: 8, runSec: 2 })}
      />
    );
    expect(screen.getByText("Parametric compilation")).toBeInTheDocument();
  });

  it("renders the qparam error card for a malformed source without throwing", () => {
    expect(() => render(<ParamCompileExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qparam error:/)).toBeInTheDocument();
  });

  it("announces the wall-clock percent saved", () => {
    render(
      <ParamCompileExplorer
        source={JSON.stringify({ iterations: 50, compileSec: 8, runSec: 2 })}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(/%/);
  });
});
