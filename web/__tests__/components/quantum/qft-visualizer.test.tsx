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
  it("rejects a period that does not divide N (the false 'spikes every N/r' case)", () => {
    // N = 2^3 = 8; period 3 does not divide 8.
    render(<QftVisualizer source={JSON.stringify({ qubits: 3, input: "period:3" })} />);
    expect(screen.getByText(/period must divide/i)).toBeInTheDocument();
  });
  it("accepts a period that divides N", () => {
    render(<QftVisualizer source={JSON.stringify({ qubits: 3, input: "period:4" })} />);
    expect(screen.queryByText(/must divide/i)).not.toBeInTheDocument();
    expect(screen.getByText(/fourier/i)).toBeInTheDocument();
  });
});
