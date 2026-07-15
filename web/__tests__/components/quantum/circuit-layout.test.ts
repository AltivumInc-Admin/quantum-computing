import { parseProgram } from "@/components/quantum/qsim-dsl";
import { gateFamily, layoutCircuit } from "@/components/quantum/circuit-layout";

// Columns of the placed gates, in program order — the moment index each gate
// packs into.
const cols = (src: string) => layoutCircuit(parseProgram(src)).gates.map((p) => p.col);

describe("layoutCircuit (greedy moment left-pack)", () => {
  it("packs a Bell circuit into two moments", () => {
    const layout = layoutCircuit(parseProgram("H 0\nCNOT 0 1"));
    expect(layout.n).toBe(2);
    expect(layout.gates.map((p) => p.col)).toEqual([0, 1]);
    expect(layout.cols).toBe(2);
    expect(layout.depth).toBe(2);
  });

  it("shares a column between independent single-qubit gates", () => {
    const layout = layoutCircuit(parseProgram("H 0\nH 1"));
    expect(cols("H 0\nH 1")).toEqual([0, 0]);
    expect(layout.cols).toBe(1);
    expect(layout.depth).toBe(1);
  });

  it("blocks the wires a CNOT spans (nothing renders inside the connector)", () => {
    // The CNOT 0->2 connector crosses q1, so an H on q1 cannot share column 0.
    expect(cols("CNOT 0 2\nH 1")).toEqual([0, 1]);
    // And the block is order-independent: a prior gate on the spanned wire
    // pushes the CNOT right.
    expect(cols("X 1\nCNOT 0 2")).toEqual([0, 1]);
  });

  it("keeps depth Braket-faithful when it diverges from the visual columns", () => {
    // Braket's Moments scheduler unions only the qubits a gate touches: the
    // CNOT 0->2 and the H 1 are disjoint, so circuit.depth is 1 even though
    // the drawing needs 2 columns to keep H 1 out of the connector. The aria
    // sentence must report 1 here, or a learner running circuit.depth in a
    // notebook sees a different number than the diagram announced.
    const layout = layoutCircuit(parseProgram("CNOT 0 2\nH 1"));
    expect(layout.cols).toBe(2);
    expect(layout.depth).toBe(1);
  });

  it("lays a GHZ-3 chain into three successive moments", () => {
    const layout = layoutCircuit(parseProgram("H 0\nCNOT 0 1\nCNOT 1 2"));
    expect(layout.gates.map((p) => p.col)).toEqual([0, 1, 2]);
    expect(layout.cols).toBe(3);
    expect(layout.depth).toBe(3);
  });

  it("widens to the qubits directive even when the extra wire is unused", () => {
    const layout = layoutCircuit(parseProgram("qubits 3\nH 0"));
    expect(layout.n).toBe(3);
    expect(layout.gates).toHaveLength(1);
    expect(layout.gates[0].col).toBe(0);
    expect(layout.depth).toBe(1);
  });

  it("renders an empty source as one bare wire, zero depth", () => {
    const layout = layoutCircuit(parseProgram(""));
    expect(layout).toEqual({ n: 1, cols: 0, depth: 0, gates: [] });
  });

  it("treats an errored program as empty (belt-and-braces for a broken parse)", () => {
    const errored = parseProgram("H 0\nFLURB 1");
    expect(errored.error).toBeDefined();
    expect(layoutCircuit(errored)).toEqual({ n: 1, cols: 0, depth: 0, gates: [] });
  });
});

describe("gateFamily", () => {
  // Pinned exhaustively over every name parseProgram can emit — the tripwire
  // against a future DSL gate silently miscoloring.
  it.each([
    ["H", "h"],
    ["X", "x"],
    ["I", "x"],
    ["CNOT", "x"],
    ["Y", "rot"],
    ["RX", "rot"],
    ["RY", "rot"],
    ["Z", "phase"],
    ["S", "phase"],
    ["T", "phase"],
    ["RZ", "phase"],
  ])("maps %s to the %s family", (name, family) => {
    expect(gateFamily(name)).toBe(family);
  });
});
