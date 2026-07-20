/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { QaoaExplorer } from "@/components/quantum/qaoa-explorer";

const TRIANGLE = JSON.stringify({ edges: [[0, 1], [1, 2], [2, 0]] });

/** The live (gamma, beta) point inside the landscape heatmap. */
function currentPoint(): SVGCircleElement {
  const svg = screen.getByRole("img", { name: /expected-cut landscape/i });
  const circle = svg.querySelector("circle");
  if (!circle) throw new Error("landscape has no current-point marker");
  return circle as SVGCircleElement;
}

describe("QaoaExplorer", () => {
  it("renders the QAOA header and a max-cut readout for the triangle", () => {
    render(<QaoaExplorer source={JSON.stringify({ edges: [[0, 1], [1, 2], [2, 0]] })} />);
    expect(screen.getByText(/qaoa/i)).toBeInTheDocument();
    // "max" appears in the visible readout and the sr-only status ("maximum").
    expect(screen.getAllByText(/max/i).length).toBeGreaterThan(0);
  });
  it("renders an error card for an out-of-range edge", () => {
    render(<QaoaExplorer source={JSON.stringify({ edges: [[0, 9]] })} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
  it("announces the expected cut", () => {
    render(<QaoaExplorer source={JSON.stringify({ edges: [[0, 1], [1, 2], [2, 0]] })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/expected cut/i);
  });
  it("renders vertex-order labels and the bit-order caption via ProbBars", () => {
    render(<QaoaExplorer source={JSON.stringify({ edges: [[0, 1], [1, 2], [2, 0]] })} />);
    expect(screen.getByText(/vertex 0 on the left/i)).toBeInTheDocument();
    expect(screen.getAllByText(/%$/).length).toBeGreaterThanOrEqual(8);
  });
  it("shows the gamma/beta slider readouts with a 'rad' unit (consistent with the F6 sliders)", () => {
    render(<QaoaExplorer source={JSON.stringify({ edges: [[0, 1], [1, 2], [2, 0]] })} />);
    // Both angle sliders now route their visible value through formatRadians,
    // so each renders "<value> rad" instead of a bare number (doc: F8 was bare).
    expect(screen.getAllByText(/^\d\.\d{2} rad$/).length).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------
  // Landscape axis orientation. The caption shipped saying "gamma horizontal,
  // beta vertical" while the render did the exact opposite, so every reading
  // taken off the plot came out mirror-imaged AND mis-scaled (the two axes
  // span different ranges). These pin the mapping from the RENDER side, which
  // is the side that cannot silently drift.
  // ---------------------------------------------------------------------
  describe("landscape axes", () => {
    it("the gamma slider moves the current point VERTICALLY only", () => {
      render(<QaoaExplorer source={TRIANGLE} />);
      const before = currentPoint();
      const cx = before.getAttribute("cx");
      const cy = before.getAttribute("cy");

      fireEvent.change(screen.getByRole("slider", { name: /gamma/i }), {
        target: { value: "3" },
      });

      const after = currentPoint();
      expect(after.getAttribute("cx")).toBe(cx);
      expect(after.getAttribute("cy")).not.toBe(cy);
    });

    it("the beta slider moves the current point HORIZONTALLY only", () => {
      render(<QaoaExplorer source={TRIANGLE} />);
      const before = currentPoint();
      const cx = before.getAttribute("cx");
      const cy = before.getAttribute("cy");

      fireEvent.change(screen.getByRole("slider", { name: /beta/i }), {
        target: { value: "1.5" },
      });

      const after = currentPoint();
      expect(after.getAttribute("cy")).toBe(cy);
      expect(after.getAttribute("cx")).not.toBe(cx);
    });

    it("the caption names the axes the way the render draws them", () => {
      render(<QaoaExplorer source={TRIANGLE} />);
      const caption = screen.getByText(/horizontal/i);
      // beta before "horizontal", gamma before "vertical" — the inverse of the
      // string this widget shipped with.
      expect(caption).toHaveTextContent(/β.*horizontal/);
      expect(caption).toHaveTextContent(/γ.*vertical/);
      expect(caption).not.toHaveTextContent(/γ.*horizontal.*β.*vertical/);
    });

    it("the heatmap's accessible name assigns each parameter to an axis", () => {
      render(<QaoaExplorer source={TRIANGLE} />);
      const svg = screen.getByRole("img", { name: /expected-cut landscape/i });
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toMatch(/beta 0 to pi\/2 on the horizontal axis/i);
      expect(label).toMatch(/gamma 0 to pi on the vertical axis/i);
    });
  });
});
