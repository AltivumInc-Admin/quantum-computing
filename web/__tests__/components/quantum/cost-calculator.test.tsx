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
  it("shows USD header in breakdown table", () => {
    render(<CostCalculator source={""} />);
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("Item")).toBeInTheDocument();
  });
  it("switching to LocalSimulator shows free", () => {
    render(<CostCalculator source={""} />);
    fireEvent.change(screen.getByLabelText(/device/i), { target: { value: "LocalSimulator" } });
    expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
  });
  it("applies a valid fenced preset (provider + shots)", () => {
    render(<CostCalculator source={JSON.stringify({ provider: "IQM", shots: 500 })} />);
    expect(screen.getByLabelText(/device/i)).toHaveValue("IQM");
    expect(screen.getByLabelText(/shots/i)).toHaveValue(500);
  });
  it("falls back to defaults for unknown provider and non-positive shots (no error card)", () => {
    render(<CostCalculator source={JSON.stringify({ provider: "Nope", shots: -5 })} />);
    expect(screen.getByLabelText(/device/i)).toHaveValue("IonQ");
    expect(screen.getByLabelText(/shots/i)).toHaveValue(1000);
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
  it("silently falls back to defaults for malformed JSON (lenient by design)", () => {
    render(<CostCalculator source={"{not json"} />);
    expect(screen.getByLabelText(/device/i)).toHaveValue("IonQ");
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});
