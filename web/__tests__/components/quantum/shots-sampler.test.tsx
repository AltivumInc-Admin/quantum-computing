/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShotsSampler } from "@/components/quantum/shots-sampler";

describe("ShotsSampler", () => {
  it("shows the exact 50/50 distribution for H on one qubit before any run", () => {
    render(<ShotsSampler source={"qubits 1\nH 0"} />);
    expect(screen.getAllByText(/50\.0%|50%/).length).toBeGreaterThan(0);
  });
  it("running shots updates the total", () => {
    render(<ShotsSampler source={"qubits 1\nH 0"} />);
    fireEvent.click(screen.getByRole("button", { name: "1000 shots" }));
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    expect(screen.getByText("1,000 shots")).toBeInTheDocument();
  });

  it("groups the count identically before Run, in the chip, and in the announcement", () => {
    render(<ShotsSampler source={"qubits 1\nH 0"} />);
    fireEvent.click(screen.getByRole("button", { name: "10000 shots" }));
    // Pending hint.
    expect(screen.getByText(/press run to sample 10,000 shots/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    // Header chip and screen-reader line, same grouping.
    expect(screen.getByText("10,000 shots")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/sampled 10,000 shots/i);
  });
  it("renders a parse-error card for a bad circuit", () => {
    render(<ShotsSampler source={"NOTAGATE 0"} />);
    expect(screen.getByText(/parse error/i)).toBeInTheDocument();
  });
  it("marks the exact probability on each bar (one marker per basis state)", () => {
    const { container } = render(<ShotsSampler source={"qubits 1\nH 0"} />);
    expect(container.querySelectorAll('span[title^="Exact:"]')).toHaveLength(2);
  });
  it("prompts the learner to Run before the first sample", () => {
    render(<ShotsSampler source={"qubits 1\nH 0"} />);
    expect(screen.getByText(/press run to sample/i)).toBeInTheDocument();
  });
  it("announces the sampled shots and most-probable basis after Run", () => {
    render(<ShotsSampler source={"qubits 1\nH 0"} />);
    fireEvent.click(screen.getByRole("button", { name: "1000 shots" }));
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/sampled 1,000 shots/i);
    expect(status).toHaveTextContent(/empirical/i);
  });

  it("rejects a slider-bound theta instead of silently sampling at theta=0", () => {
    // The DSL parses `theta` in any fence, but this widget renders no slider,
    // so it would have shown a flat P(0)=100% under the "Exact probability"
    // legend with a chip advertising "RY(θ) q0".
    render(<ShotsSampler source={"qubits 1\nRY 0 theta"} />);
    expect(screen.getByText(/slider-bound theta is not supported/i)).toBeInTheDocument();
  });
});
