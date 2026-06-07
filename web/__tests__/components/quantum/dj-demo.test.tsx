/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DjDemo } from "@/components/quantum/dj-demo";

describe("DjDemo", () => {
  it("defaults to a constant oracle and reads Constant", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    expect(screen.getByText(/constant/i)).toBeInTheDocument();
  });
  it("switching to a balanced oracle reads Balanced", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    fireEvent.change(screen.getByLabelText(/oracle/i), { target: { value: "parity" } });
    expect(screen.getByText(/balanced/i)).toBeInTheDocument();
  });
});
