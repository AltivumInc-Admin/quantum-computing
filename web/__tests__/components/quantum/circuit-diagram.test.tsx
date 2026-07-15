/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { parseProgram } from "@/components/quantum/qsim-dsl";
import { CircuitDiagram } from "@/components/quantum/circuit-diagram";

const prog = (src: string) => parseProgram(src);
const region = () => screen.getByRole("region", { name: "Circuit diagram, scrollable" });

describe("CircuitDiagram", () => {
  it("names the whole SVG with a single composed sentence (Bell)", () => {
    render(<CircuitDiagram program={prog("H 0\nCNOT 0 1")} />);
    expect(
      screen.getByRole("img", {
        name: "Quantum circuit: 2 qubits, depth 2. H q0; CNOT 0→1. All qubits measured.",
      }),
    ).toBeInTheDocument();
  });

  it("wraps the diagram in a focusable, labeled scroll region", () => {
    render(<CircuitDiagram program={prog("H 0\nCNOT 0 1")} />);
    expect(region()).toHaveAttribute("tabindex", "0");
  });

  it("appends one measure meter per qubit", () => {
    const { container } = render(<CircuitDiagram program={prog("H 0\nCNOT 0 1")} />);
    expect(container.querySelectorAll('[data-testid="meter"]')).toHaveLength(2);
  });

  it("draws the CNOT target in the x-family color with its dark variant", () => {
    const { container } = render(<CircuitDiagram program={prog("H 0\nCNOT 0 1")} />);
    expect(container.querySelector('[class*="dark:fill-[#4589FF]"]')).not.toBeNull();
  });

  it("labels a bound rotation with θ and a literal with its 2-dp angle", () => {
    const { rerender } = render(<CircuitDiagram program={prog("RY 0 theta")} />);
    expect(screen.getByText("θ")).toBeInTheDocument();
    rerender(<CircuitDiagram program={prog("RX 0 1.5708")} />);
    expect(screen.getByText("1.57")).toBeInTheDocument();
  });

  it("dims when stale and stays solid otherwise", () => {
    const { rerender } = render(<CircuitDiagram program={prog("H 0")} stale />);
    expect(region().className).toContain("opacity-50");
    rerender(<CircuitDiagram program={prog("H 0")} />);
    expect(region().className).not.toContain("opacity-50");
  });

  it("renders an empty program without throwing and says 'no gates'", () => {
    render(<CircuitDiagram program={prog("")} />);
    expect(
      screen.getByRole("img", {
        name: "Quantum circuit: 1 qubit, no gates. All qubits measured.",
      }),
    ).toBeInTheDocument();
  });
});
