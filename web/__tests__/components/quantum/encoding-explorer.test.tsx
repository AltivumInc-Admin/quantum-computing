/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
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
  it("announces the feature map and norm, and embeds norm in the slider value text", () => {
    render(<EncodingExplorer source={JSON.stringify({ x: [0.6, 0.9], encoding: "angle" })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/feature map/i);
    const sliders = screen.getAllByRole("slider");
    expect(sliders[0]).toHaveAttribute("aria-valuetext", expect.stringMatching(/norm/i));
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
});
