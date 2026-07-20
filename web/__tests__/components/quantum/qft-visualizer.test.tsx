/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { QftVisualizer } from "@/components/quantum/qft-visualizer";

/** The value column of every magnitude bar, in document order (input, then output). */
function magnitudes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("span.tabular-nums")).map(
    (el) => el.textContent ?? ""
  );
}

describe("QftVisualizer", () => {
  it("renders the Fourier header for a period input", () => {
    render(<QftVisualizer source={JSON.stringify({ qubits: 4, input: "period:2" })} />);
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
  it("renders the spectrum note as visible text (no dead live region)", () => {
    // The widget has no controls, so `note` is invariant for its lifetime —
    // wrapping it in a role="status" live region could never fire and only
    // duplicated the visible footer in the accessibility tree.
    render(<QftVisualizer source={JSON.stringify({ qubits: 3, input: "period:4" })} />);
    expect(screen.getByText(/spikes every/i)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("renders the error card for malformed JSON", () => {
    render(<QftVisualizer source="{not json" />);
    expect(screen.getByText(/invalid json/i)).toBeInTheDocument();
  });
  it("still renders the Fourier header for an empty source (default)", () => {
    render(<QftVisualizer source="" />);
    expect(screen.getByText(/fourier/i)).toBeInTheDocument();
  });
  it("renders magnitude values via Bar-based MagnitudeBars", () => {
    render(<QftVisualizer source={JSON.stringify({ qubits: 3, input: "period:4" })} />);
    expect(screen.getAllByText(/^\d\.\d\d$/).length).toBeGreaterThan(0);
  });

  it("the default configuration actually SHOWS a transformation", () => {
    // A period-r comb on N states has teeth 1/sqrt(N/r) and transforms to
    // spikes 1/sqrt(r), so at r = sqrt(N) the QFT maps the state to itself and
    // the two panels render byte-identical charts. The default used to be
    // qubits 4 / period 4 — exactly that fixed point. This pins the invariant
    // that the widget's own default must not be self-dual again.
    const { container } = render(<QftVisualizer source="" />);
    const values = magnitudes(container);
    const N = 16;
    const input = values.slice(0, N);
    const output = values.slice(N, 2 * N);
    expect(input).toHaveLength(N);
    expect(output).toHaveLength(N);
    expect(output).not.toEqual(input);
    // r = 2 on N = 16: eight 1/sqrt(8) teeth collapsing to two 1/sqrt(2) spikes.
    expect(input.filter((v) => v === "0.35")).toHaveLength(8);
    expect(output.filter((v) => v === "0.71")).toHaveLength(2);
  });

  it("keeps the fixed-point config available when asked for explicitly", () => {
    // qubits 4 / period 4 is still a legal (and mathematically interesting)
    // fence — it is only a bad DEFAULT, not a bad configuration.
    const { container } = render(
      <QftVisualizer source={JSON.stringify({ qubits: 4, input: "period:4" })} />
    );
    const values = magnitudes(container);
    expect(values.slice(16, 32)).toEqual(values.slice(0, 16));
  });
});
