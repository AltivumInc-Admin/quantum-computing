/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { Challenge } from "@/components/quantum/challenge";

const bell = JSON.stringify({
  prompt: "Prepare the Bell state Φ+ on 2 qubits.",
  qubits: 2,
  target: { program: "H 0\nCNOT 0 1" },
  starter: "H 0",
  allowedGates: ["H", "X", "CNOT"],
  hint: "Entangle after a Hadamard.",
});

describe("Challenge", () => {
  beforeEach(() => localStorage.clear());

  it("renders the prompt", () => {
    render(<Challenge source={bell} />);
    expect(screen.getByText(/Prepare the Bell state/)).toBeInTheDocument();
  });

  it("shows an error for a malformed challenge", () => {
    render(<Challenge source="{ not json" />);
    expect(screen.getByText(/challenge error/i)).toBeInTheDocument();
  });

  it("seeds the editor with the starter code", () => {
    render(<Challenge source={bell} />);
    expect(screen.getByRole("textbox")).toHaveValue("H 0");
  });

  it("marks a correct solution solved and persists progress", () => {
    render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(screen.getByText(/correct/i)).toBeInTheDocument();
    expect(
      Object.keys(localStorage).some((k) => k.startsWith("qc:challenge:"))
    ).toBe(true);
  });

  it("surfaces the hint when the answer is wrong", () => {
    render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "H 0" } });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(screen.getByText(/entangle after a hadamard/i)).toBeInTheDocument();
  });
});
