/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TopologyExplorer } from "@/components/quantum/topology-explorer";

describe("TopologyExplorer", () => {
  it("reports the SWAP cost as two-qubit gates (3 CNOTs per SWAP), not a flat depth", () => {
    render(<TopologyExplorer source={JSON.stringify({ topology: "line", qubits: 5, gate: [0, 4] })} />);
    expect(screen.getByText(/3 SWAP/i)).toBeInTheDocument();
    // 3 SWAPs x 3 = 9 two-qubit gates; the old misleading "depth +3" must be gone.
    expect(screen.getByText(/\+9 two-qubit gates/i)).toBeInTheDocument();
    expect(screen.queryByText(/depth \+3/i)).not.toBeInTheDocument();
  });
  it("reports 0 SWAPs / +0 two-qubit gates for all-to-all", () => {
    render(<TopologyExplorer source={JSON.stringify({ topology: "all-to-all", qubits: 5, gate: [0, 4] })} />);
    expect(screen.getByText(/0 SWAP/i)).toBeInTheDocument();
    expect(screen.getByText(/\+0 two-qubit gates/i)).toBeInTheDocument();
  });
  it("renders an error card for bad JSON", () => {
    render(<TopologyExplorer source={"{ not json"} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
