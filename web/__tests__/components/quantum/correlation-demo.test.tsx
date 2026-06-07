/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CorrelationDemo } from "@/components/quantum/correlation-demo";

const SOURCE = JSON.stringify({ prompt: "Measure both repeatedly.", entangled: "H 0\nCNOT 0 1", product: "H 0\nH 1" });

describe("CorrelationDemo", () => {
  it("renders the prompt and a Measure button", () => {
    render(<CorrelationDemo source={SOURCE} />);
    expect(screen.getByText(/measure both repeatedly/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Measure" })).toBeInTheDocument();
  });
  it("accumulates measurements when Measure is clicked", () => {
    render(<CorrelationDemo source={SOURCE} />);
    const btn = screen.getByRole("button", { name: "Measure" });
    for (let i = 0; i < 5; i++) fireEvent.click(btn);
    expect(screen.getByText(/\b5\b/)).toBeInTheDocument();
  });
  it("renders an error card for malformed JSON", () => {
    render(<CorrelationDemo source={"{ not json"} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
