/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { WavefunctionScrubber } from "@/components/quantum/wavefunction-scrubber";

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

describe("WavefunctionScrubber", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders a parse error for invalid DSL", () => {
    render(<WavefunctionScrubber source="FOO 0" />);
    expect(screen.getByText(/parse error/i)).toBeInTheDocument();
  });

  it("renders a scrub slider spanning the gate count (frames 0..N)", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    const slider = screen.getByRole("slider", { name: /step/i });
    expect(slider).toHaveAttribute("max", "2");
  });

  it("announces the scrub position via aria-valuetext", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    const slider = screen.getByRole("slider", { name: /step/i });
    expect(slider).toHaveAttribute("aria-valuetext", expect.stringMatching(/step \d+ of \d+/i));
  });

  it("shows the |0...0> ground state at step 0", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    expect(screen.getByText(/1\.00\|00⟩/)).toBeInTheDocument();
  });

  it("advances the state vector when the scrubber moves", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    const slider = screen.getByRole("slider", { name: /step/i });
    fireEvent.change(slider, { target: { value: "2" } });
    // Dirac line shows the Bell superposition (0.71|00> + 0.71|11>); the
    // 0.71 prefix distinguishes it from the bare |11> amplitude-bar label.
    expect(screen.getByText(/0\.71\|11⟩/)).toBeInTheDocument();
  });

  it("marks exactly one gate chip as the current step after a scrub", () => {
    const { container } = render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    const slider = screen.getByRole("slider", { name: /step/i });
    fireEvent.change(slider, { target: { value: "2" } });
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("renders the fallback Bloch dial at 180px for a single-qubit circuit", () => {
    render(<WavefunctionScrubber source="H 0" />);
    const svg = screen.getByLabelText(/bloch vector/i);
    expect(svg).toHaveAttribute("width", "180");
    expect(svg).toHaveAttribute("height", "180");
  });
  it("offers a Play control when motion is allowed", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("hides the Play control under prefers-reduced-motion", () => {
    mockMatchMedia(true);
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    expect(
      screen.queryByRole("button", { name: /play/i })
    ).not.toBeInTheDocument();
  });
});
