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
    expect(screen.getByText("1000 shots")).toBeInTheDocument();
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
    expect(status).toHaveTextContent(/sampled 1000 shots/i);
    expect(status).toHaveTextContent(/empirical/i);
  });
});
