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
});
