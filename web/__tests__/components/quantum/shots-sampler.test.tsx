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
    fireEvent.click(screen.getByRole("button", { name: /^1000$/ }));
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    expect(screen.getByText(/1000 shots/i)).toBeInTheDocument();
  });
  it("renders a parse-error card for a bad circuit", () => {
    render(<ShotsSampler source={"NOTAGATE 0"} />);
    expect(screen.getByText(/parse error/i)).toBeInTheDocument();
  });
});
