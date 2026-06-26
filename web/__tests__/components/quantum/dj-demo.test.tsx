/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DjDemo } from "@/components/quantum/dj-demo";

describe("DjDemo", () => {
  it("defaults to a constant oracle and reads Constant", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    // "Constant" appears in both the visible verdict badge and the sr-only status.
    expect(screen.getAllByText(/constant/i).length).toBeGreaterThan(0);
  });
  it("switching to a balanced oracle reads Balanced and announces the verdict", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    fireEvent.change(screen.getByLabelText(/oracle/i), { target: { value: "parity" } });
    expect(screen.getAllByText(/balanced/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(/verdict: balanced/i);
  });
  it("renders the footnote caption with the shared .text-caption utility", () => {
    render(<DjDemo source={JSON.stringify({ qubits: 3 })} />);
    const footnote = screen.getByText(/one query decides it/i);
    expect(footnote).toHaveClass("text-caption");
    expect(footnote).not.toHaveClass("text-gray-400");
  });
});
