/**
 * Pure layout math for the read-only circuit diagram. Zero React imports (same
 * split as chart-utils.ts): this module owns only the moment-packing arithmetic;
 * the SVG geometry and rendering stay in circuit-diagram.tsx.
 *
 * The packing is the Braket-Moments / quantum-viz greedy left-pack: each gate
 * slides as far left as its wires allow, so independent gates share a column.
 * Columns correspond 1:1 to Braket "moments" — the diagram's column count equals
 * `circuit.depth` in the platform's notebooks, so a learner reading the diagram
 * and running `circuit.depth` in a cell sees the same number.
 */

import type { ParsedGate, Program } from "./qsim-dsl";

export type GateFamily = "h" | "x" | "rot" | "phase";

// Exhaustive over every name parseProgram can emit (SINGLE ∪ ROT ∪ CNOT).
// Grouped by the Qiskit "iqp" family coloring the diagram uses: Hadamard is its
// own hue; X/CNOT/I are the "x" (basis-flip) family; Y/RX/RY are rotations;
// Z/S/T/RZ are the phase family.
const FAMILY: Record<string, GateFamily> = {
  H: "h",
  X: "x",
  CNOT: "x",
  I: "x",
  Y: "rot",
  RX: "rot",
  RY: "rot",
  Z: "phase",
  S: "phase",
  T: "phase",
  RZ: "phase",
};

/**
 * Family bucket for a gate name, driving its diagram color. parseProgram is the
 * sole gatekeeper of gate names, so every name reaching here is a key of FAMILY;
 * the `?? "phase"` is unreachable belt-and-braces. A render path must never
 * throw, so a hypothetical future DSL gate colors as a phase box instead of
 * crashing the diagram.
 */
export function gateFamily(name: string): GateFamily {
  return FAMILY[name] ?? "phase";
}

/** A gate assigned to a column, with its precomputed family. */
export interface PlacedGate {
  g: ParsedGate;
  col: number;
  family: GateFamily;
}

/**
 * The fully placed circuit. `cols` and `depth` deliberately differ:
 *
 * - `cols` is the number of VISUAL columns (max col + 1, or 0 when empty).
 *   Column packing blocks the contiguous wire span of a two-qubit gate, so an
 *   independent gate on a skipped-over wire is pushed right rather than drawn
 *   through the CNOT's vertical connector.
 * - `depth` is Braket's `circuit.depth` for the same program: its Moments
 *   scheduler unions only the EXACT qubits a gate touches (control and
 *   target), not the wires between them. `CNOT 0 2` and `H 1` share a moment
 *   (depth 1) but cannot share a drawn column (cols 2).
 *
 * Anything surfaced to the user as "depth" must use `depth`, never `cols`.
 */
export interface CircuitLayout {
  n: number;
  cols: number;
  depth: number;
  gates: PlacedGate[];
}

/**
 * Greedy left-pack over two per-wire "next free column" frontiers: the visual
 * frontier advances every wire in a gate's contiguous span (nothing ever
 * renders inside a CNOT connector — the quantum-viz convention), while the
 * depth frontier advances only the gate's own qubits (Braket's Moments rule).
 *
 * Callers pass the LAST-GOOD program (the bench never renders a broken parse),
 * so an errored program is treated as empty here purely as belt-and-braces.
 */
export function layoutCircuit(program: Program): CircuitLayout {
  const n = Math.max(program.n, 1);
  if (program.error) return { n, cols: 0, depth: 0, gates: [] };

  const visual = new Array<number>(n).fill(0);
  const moments = new Array<number>(n).fill(0);
  const gates: PlacedGate[] = [];
  let cols = 0;
  let depth = 0;

  for (const g of program.gates) {
    // Contiguous span [lo..hi] — a two-qubit gate blocks the wires it crosses.
    const lo = Math.min(g.target, g.control ?? g.target);
    const hi = Math.max(g.target, g.control ?? g.target);
    let col = 0;
    for (let q = lo; q <= hi; q++) col = Math.max(col, visual[q]);
    gates.push({ g, col, family: gateFamily(g.gate) });
    for (let q = lo; q <= hi; q++) visual[q] = col + 1;
    cols = Math.max(cols, col + 1);

    // Braket-faithful depth: only the qubits the gate actually touches.
    const touched = g.control === undefined ? [g.target] : [g.control, g.target];
    const moment = Math.max(...touched.map((q) => moments[q]));
    for (const q of touched) moments[q] = moment + 1;
    depth = Math.max(depth, moment + 1);
  }

  return { n, cols, depth, gates };
}
