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

describe("node layout legibility", () => {
  /** Circle centre + radius for every rendered node, in viewBox units. */
  function nodes(container: HTMLElement) {
    return Array.from(container.querySelectorAll("circle")).map((c) => ({
      cx: Number(c.getAttribute("cx")),
      cy: Number(c.getAttribute("cy")),
      r: Number(c.getAttribute("r")),
    }));
  }

  // MAX_QUBITS = 16 is the widget's advertised ceiling (and is pinned above), so
  // every layout must render legibly at it. The line layout used to space nodes
  // at 300/(n+1) against a fixed 20px diameter, so disks overlapped from n = 15.
  for (const topology of ["line", "ring", "grid", "all-to-all"] as const) {
    it(`draws non-overlapping nodes for ${topology} at the 16-qubit maximum`, () => {
      const { container } = render(
        <TopologyExplorer source={JSON.stringify({ topology, qubits: 16, gate: [0, 15] })} />
      );
      const drawn = nodes(container);
      expect(drawn).toHaveLength(16);
      for (const n of drawn) expect(n.r).toBeGreaterThan(0);
      for (let i = 0; i < drawn.length; i++) {
        for (let j = i + 1; j < drawn.length; j++) {
          const gap = Math.hypot(drawn[i].cx - drawn[j].cx, drawn[i].cy - drawn[j].cy);
          expect(gap).toBeGreaterThanOrEqual(drawn[i].r + drawn[j].r);
        }
      }
    });
  }

  it("keeps the full node radius where spacing allows (the lesson's 9-qubit grid)", () => {
    const { container } = render(
      <TopologyExplorer source={JSON.stringify({ topology: "grid", qubits: 9, gate: [0, 8] })} />
    );
    for (const n of nodes(container)) expect(n.r).toBe(10);
  });
});
