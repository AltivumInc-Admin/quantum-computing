/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-cost-estimator.test.tsx
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CostEstimator } from "@/components/pricing/cost-estimator";

describe("CostEstimator", () => {
  it("defaults to IQM Garnet at 1,000 shots and prices the run correctly", () => {
    render(<CostEstimator />);
    // 0.163 x 1000 + 34 = 197 credits = $1.97
    expect(screen.getByText("197 credits")).toBeInTheDocument();
    expect(screen.getByText(/\$1\.97/)).toBeInTheDocument();
  });

  it("recomputes when the shot count changes", () => {
    render(<CostEstimator />);
    fireEvent.change(screen.getByLabelText("Shots"), { target: { value: "100" } });
    // 0.163 x 100 + 34 = 50.3 credits
    expect(screen.getByText("50.3 credits")).toBeInTheDocument();
  });

  it("recomputes when the backend changes", () => {
    render(<CostEstimator />);
    const select = screen.getByLabelText("Backend") as HTMLSelectElement;
    const forteIdx = Array.from(select.options).findIndex((o) =>
      o.text.startsWith("IonQ Forte-1")
    );
    fireEvent.change(select, { target: { value: String(forteIdx) } });
    // 9.0 x 1000 + 34 = 9,034 credits = $90.34
    expect(screen.getByText("9,034 credits")).toBeInTheDocument();
    expect(screen.getByText(/\$90\.34/)).toBeInTheDocument();
  });

  it("prices a month of tutoring by model and question count", () => {
    render(<CostEstimator />);
    // Default Haiku x 100 questions = 100 credits.
    expect(screen.getByText("100 credits")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fable" }));
    // Fable: 7 x 100 = 700 credits = $7.00 / mo
    expect(screen.getByText("700 credits")).toBeInTheDocument();
    expect(screen.getByText(/\$7\.00/)).toBeInTheDocument();
  });

  it("selects shot presets via chips", () => {
    render(<CostEstimator />);
    // "10,000" appears only among the shot presets (question presets top out at 300).
    fireEvent.click(screen.getByRole("button", { name: "10,000" }));
    expect(screen.getByText("1,664 credits")).toBeInTheDocument();
  });
});
