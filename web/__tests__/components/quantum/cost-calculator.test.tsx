/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CostCalculator } from "@/components/quantum/cost-calculator";

describe("CostCalculator", () => {
  it("defaults to IonQ and shows the $10.30 total", () => {
    render(<CostCalculator source={""} />);
    expect(screen.getByText(/\$10\.30/)).toBeInTheDocument();
  });
  it("switching to LocalSimulator shows free", () => {
    render(<CostCalculator source={""} />);
    fireEvent.change(screen.getByLabelText(/device/i), { target: { value: "LocalSimulator" } });
    expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
  });
});
