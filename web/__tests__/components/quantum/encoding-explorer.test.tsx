/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { EncodingExplorer } from "@/components/quantum/encoding-explorer";

describe("EncodingExplorer", () => {
  it("renders the Encoding header and a unit-norm readout", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "angle" })} />);
    expect(screen.getByText(/encoding/i)).toBeInTheDocument();
    // "1.000" appears in both the visible norm readout and the sr-only status.
    expect(screen.getAllByText(/1\.000/).length).toBeGreaterThan(0);
  });
  it("switches encoding without crashing", () => {
    render(<EncodingExplorer source={""} />);
    fireEvent.change(screen.getByLabelText(/encoding/i), { target: { value: "iqp" } });
    expect(screen.getByText(/encoding/i)).toBeInTheDocument();
  });
  /**
   * The live region announces the map plus the dominant basis outcome — one
   * concise line, per live-status.tsx's own contract. It must NOT carry the
   * full Dirac expansion (four complex terms for IQP, re-announced on each of
   * the 120 slider positions), and neither it nor the sliders' valuetext may
   * carry the norm: all three encodings pin it at 1.000 by construction
   * (max |norm - 1| = 8.9e-16 over the whole reachable slider grid), so it is a
   * constant padding out the announcement of the value that IS changing.
   */
  it("announces the feature map and the dominant basis state, and nothing invariant", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "iqp" })} />);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent(/feature map/i);
    expect(live).toHaveTextContent(/most probable basis state/i);
    expect(live).not.toHaveTextContent(/norm|‖/i);
    expect(live.textContent ?? "").not.toMatch(/[+-]\d+\.\d+i/); // no Dirac terms
  });
  it("keeps the sliders' value text to the feature each one drives", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "angle" })} />);
    const sliders = screen.getAllByRole("slider");
    expect(sliders[0]).toHaveAttribute("aria-valuetext", "x0 = 0.60");
    expect(sliders[1]).toHaveAttribute("aria-valuetext", "x1 = 0.90");
  });
  it("renders the qencode error card for malformed source", () => {
    expect(() => render(<EncodingExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qencode error/i)).toBeInTheDocument();
  });
  it("renders amplitude bars via ProbBars for the default angle encoding", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "angle" })} />);
    expect(screen.getAllByText(/%$/).length).toBeGreaterThanOrEqual(4);
  });
  it("gives the side-by-side Bloch dials distinguishable accessible names", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "angle" })} />);
    expect(screen.getByLabelText(/^qubit 0 reduced bloch vector/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^qubit 1 reduced bloch vector/i)).toBeInTheDocument();
  });
  it("labels the single amplitude-encoding dial distinctly", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "amplitude" })} />);
    expect(screen.getByLabelText(/^single qubit bloch vector/i)).toBeInTheDocument();
  });
  it('rejects a malformed "x" with the exact field error', () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [1] })} />);
    expect(screen.getByText(/"x" must be a two-number array/)).toBeInTheDocument();
  });
  it("rejects an unknown encoding value", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.1, 0.2], encoding: "fourier" })} />);
    expect(screen.getByText(/encoding must be one of/)).toBeInTheDocument();
  });
  it('rejects an over-long "x" instead of silently dropping the extra elements', () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9, "junk"] })} />);
    expect(screen.getByText(/"x" must be a two-number array/)).toBeInTheDocument();
  });
  it("rejects an out-of-range feature with a typed, value-echoing error", () => {
    // Previously clamped to pi in silence, rendering a plausible widget parked
    // at a point the author never asked for.
    render(<EncodingExplorer source={JSON.stringify({ x: [5, 0.2] })} />);
    expect(screen.getByText(/x\[0\] must be in -pi\.\.pi \(got 5\)/)).toBeInTheDocument();
    cleanup();
    render(<EncodingExplorer source={JSON.stringify({ x: [0.2, -9] })} />);
    expect(screen.getByText(/x\[1\] must be in -pi\.\.pi \(got -9\)/)).toBeInTheDocument();
  });
  it("uses the shared parse contract's error strings", () => {
    render(<EncodingExplorer source={"[1, 2]"} />);
    expect(screen.getByText(/expected a JSON object/)).toBeInTheDocument();
  });
});
