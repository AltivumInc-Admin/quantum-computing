/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlochBuilder } from "@/components/quantum/bloch-builder-widget";

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

describe("BlochBuilder", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders θ and φ sliders and the initial |+> state", () => {
    render(<BlochBuilder />);
    expect(screen.getByLabelText(/polar angle theta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/azimuthal angle phi/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.71\|0⟩/)).toBeInTheDocument();
  });
  it("renders the fallback Bloch dial at 180px (CLS match with the 3D sphere)", () => {
    render(<BlochBuilder />);
    const svg = screen.getByLabelText(/bloch vector/i);
    expect(svg).toHaveAttribute("width", "180");
    expect(svg).toHaveAttribute("height", "180");
  });
  it("updating θ to π collapses to |1>", () => {
    render(<BlochBuilder />);
    fireEvent.change(screen.getByLabelText(/polar angle theta/i), { target: { value: String(Math.PI) } });
    expect(screen.getByText(/1\.00\|1⟩/)).toBeInTheDocument();
  });
});
