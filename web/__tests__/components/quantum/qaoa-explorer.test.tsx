/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { QaoaExplorer } from "@/components/quantum/qaoa-explorer";

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
});
