/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { GroverVisualizer } from "@/components/quantum/grover-visualizer";

describe("GroverVisualizer", () => {
  it("renders Grover header and the optimal-iteration note for N=8", () => {
    render(<GroverVisualizer source={JSON.stringify({ qubits: 3, marked: 5 })} />);
    expect(screen.getByText(/grover/i)).toBeInTheDocument();
    expect(screen.getByText(/optimal/i)).toBeInTheDocument();
  });
  it("renders an error card for an out-of-range marked index", () => {
    render(<GroverVisualizer source={JSON.stringify({ qubits: 2, marked: 9 })} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
  it("announces the success probability and embeds it in the slider value text", () => {
    render(<GroverVisualizer source={JSON.stringify({ qubits: 3, marked: 5 })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/success probability/i);
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      expect.stringMatching(/success/i)
    );
  });
});
