/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { QftVisualizer } from "@/components/quantum/qft-visualizer";

describe("QftVisualizer", () => {
  it("renders the Fourier header for a period input", () => {
    render(<QftVisualizer source={JSON.stringify({ qubits: 4, input: "period:4" })} />);
    expect(screen.getByText(/fourier/i)).toBeInTheDocument();
  });
  it("renders an error card for too many qubits", () => {
    render(<QftVisualizer source={JSON.stringify({ qubits: 6 })} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
