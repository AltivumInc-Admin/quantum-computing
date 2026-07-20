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

  /**
   * At a 375px viewport the lesson column leaves this card 311px of inner
   * width, but a fixed w-40 label + w-20 readout + the range input's ~129px
   * intrinsic floor needs ~393px. The row could not shrink, so WidgetCard's
   * overflow-hidden clipped all three slider readouts out of sight and the two
   * to-scale comparison bars collapsed to ~45px. The labels must therefore be
   * able to take their own line below `sm`.
   */
  it("wraps every labeled row's label below sm so nothing is clipped at 375px", () => {
    const { container } = render(
      <ParamCompileExplorer
        source={JSON.stringify({ iterations: 50, compileSec: 8, runSec: 2 })}
      />
    );
    const labels = [
      screen.getByText("recompile every iteration"),
      screen.getByText("compile once, reuse"),
      ...["iterations", "compile / circuit", "run / circuit"].map((t) => screen.getByText(t)),
    ];
    for (const label of labels) {
      expect(label).toHaveClass("w-full", "sm:w-40");
      const row = label.parentElement!;
      expect(row.className).toMatch(/flex-wrap/);
    }
    // No fixed-width row may survive: a non-wrapping w-40 is what clipped it.
    expect(container.querySelectorAll(".w-40")).toHaveLength(0);
  });

  it("renders its text tiers through the theme tokens, not raw Tailwind grays", () => {
    const { container } = render(<ParamCompileExplorer source="" />);
    // --ink/--mut are warm oklch; the gray ramp is cool, so the widget rendered
    // a visibly different hue from its three F11 siblings on the same page.
    expect(container.querySelectorAll('[class*="text-gray-"]')).toHaveLength(0);
    expect(container.querySelectorAll('[class*="fill-gray-"]')).toHaveLength(0);
  });
});
