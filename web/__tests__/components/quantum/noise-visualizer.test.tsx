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
    // The slider label is channel-aware ("Depolarizing p" for the default channel).
    expect(screen.getByLabelText(/depolarizing p/i)).toBeInTheDocument();
  });
  it("renders the shared error card for a bad circuit", () => {
    render(<NoiseVisualizer source={"NOTAGATE 0"} />);
    expect(screen.getByText(/qnoise error/i)).toBeInTheDocument();
  });
  it("renders the shared error card over the 3-qubit limit", () => {
    render(<NoiseVisualizer source={"H 0\nH 1\nH 2\nH 3"} />);
    expect(screen.getByText(/qnoise error/i)).toBeInTheDocument();
  });
  it("announces the fidelity readout as a polite live region", () => {
    render(<NoiseVisualizer source={"qubits 2\nH 0\nCNOT 0 1"} />);
    // Two status regions now exist (aggregate fidelity + a per-basis delta
    // summary); target the fidelity one by its text (role=status takes no
    // name-from-content, so a name query can't disambiguate them).
    const live = screen.getByText(/fidelity/i);
    expect(live).toHaveAttribute("role", "status");
    expect(live).toHaveAttribute("aria-live", "polite");
  });
});
