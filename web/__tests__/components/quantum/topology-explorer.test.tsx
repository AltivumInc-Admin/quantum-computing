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

  // One render per parser error branch, pinning the exact quoted literals.
  const BAD_SOURCES: Array<[string, string, RegExp]> = [
    ["non-object source", "[1,2]", /expected a JSON object/],
    [
      "unknown topology",
      JSON.stringify({ topology: "star", qubits: 4, gate: [0, 1] }),
      /"topology" must be one of/,
    ],
    [
      "non-integer qubits",
      JSON.stringify({ topology: "line", qubits: 2.5, gate: [0, 1] }),
      /"qubits" must be a positive integer >= 2/,
    ],
    [
      "qubits below 2",
      JSON.stringify({ topology: "line", qubits: 1, gate: [0, 1] }),
      /"qubits" must be a positive integer >= 2/,
    ],
    [
      "qubits above the cap",
      JSON.stringify({ topology: "line", qubits: 999, gate: [0, 1] }),
      /"qubits" must be <= 16/,
    ],
    [
      "gate not a 2-element array",
      JSON.stringify({ topology: "line", qubits: 4, gate: [0] }),
      /"gate" must be a 2-element array of integers/,
    ],
    [
      "non-integer gate indices",
      JSON.stringify({ topology: "line", qubits: 4, gate: [0, 1.5] }),
      /"gate" indices must be integers/,
    ],
    [
      "out-of-range gate index",
      JSON.stringify({ topology: "line", qubits: 4, gate: [0, 7] }),
      /"gate" indices must be in range \[0, 3\]/,
    ],
    [
      "identical gate indices",
      JSON.stringify({ topology: "line", qubits: 4, gate: [1, 1] }),
      /"gate" indices must be distinct/,
    ],
  ];
  for (const [name, source, message] of BAD_SOURCES) {
    it(`rejects ${name} with its exact error`, () => {
      render(<TopologyExplorer source={source} />);
      expect(screen.getByText(message)).toBeInTheDocument();
    });
  }
});
