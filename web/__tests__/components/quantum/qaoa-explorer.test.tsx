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
    expect(screen.getByText(/max/i)).toBeInTheDocument();
  });
  it("renders an error card for an out-of-range edge", () => {
    render(<QaoaExplorer source={JSON.stringify({ edges: [[0, 9]] })} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
