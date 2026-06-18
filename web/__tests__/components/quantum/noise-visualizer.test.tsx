/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { NoiseVisualizer } from "@/components/quantum/noise-visualizer";

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((q: string) => ({
    matches: reduced, media: q, onchange: null,
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn(),
  }));
}

describe("NoiseVisualizer", () => {
  beforeEach(() => mockMatchMedia(false));
  it("renders fidelity 100% for a Bell pair at default p=0", () => {
    render(<NoiseVisualizer source={"qubits 2\nH 0\nCNOT 0 1"} />);
    expect(screen.getByText(/100/)).toBeInTheDocument();
    expect(screen.getByLabelText(/error rate/i)).toBeInTheDocument();
  });
  it("renders a parse-error card for a bad circuit", () => {
    render(<NoiseVisualizer source={"NOTAGATE 0"} />);
    expect(screen.getByText(/parse error/i)).toBeInTheDocument();
  });
  it("announces the fidelity readout as a polite live region", () => {
    render(<NoiseVisualizer source={"qubits 2\nH 0\nCNOT 0 1"} />);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent(/fidelity/i);
    expect(live).toHaveAttribute("aria-live", "polite");
  });
});
