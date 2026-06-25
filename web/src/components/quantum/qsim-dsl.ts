/**
 * Parser for the tiny `qsim` gate DSL shared by the inline CircuitLab and the
 * WavefunctionScrubber. Both render from the same parsed Program, so a circuit
 * written in a GUIDE behaves identically in the static readout and the
 * scrubbable player.
 *
 * DSL (one instruction per line; '#' starts a comment):
 *   qubits 2          # optional; inferred from the highest qubit index
 *   H 0
 *   CNOT 0 1
 *   RY 0 theta        # 'theta' binds the gate to the slider
 *   RX 0 1.5708       # or a literal angle in radians
 */

import { type Op, NAMED_GATES } from "./math";
import { parseIndex, parseAngle } from "./parse-utils";

export const MAX_QUBITS = 4;

export interface ParsedGate {
  gate: string;
  target: number;
  control?: number;
  theta?: number;
  bound?: boolean; // true if theta is the slider-bound value
}

export interface Program {
  n: number;
  gates: ParsedGate[];
  hasTheta: boolean;
  error?: string;
}

// Single-qubit gate names come straight from the math kernel's NAMED_GATES so
// the parser and the executor can't drift. RX/RY/RZ are parameterized rotations
// (functions, not in NAMED_GATES) so they stay listed explicitly.
export const SINGLE = new Set(Object.keys(NAMED_GATES));
export const ROT = new Set(["RX", "RY", "RZ"]);

export function parseProgram(source: string): Program {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const gates: ParsedGate[] = [];
  let n = 0;
  let hasTheta = false;

  try {
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const head = parts[0].toLowerCase();

      if (head === "qubits") {
        const got = parseIndex(parts[1]);
        if (!got.ok) throw new Error("qubits directive needs a non-negative count");
        n = Math.max(n, got.value);
        continue;
      }

      const gate = parts[0].toUpperCase();

      if (gate === "CNOT") {
        const c = parseIndex(parts[1]);
        const t = parseIndex(parts[2]);
        if (!c.ok || !t.ok) throw new Error("CNOT needs a control and a target qubit");
        const control = c.value;
        const target = t.value;
        gates.push({ gate, target, control });
        n = Math.max(n, control + 1, target + 1);
      } else if (ROT.has(gate)) {
        const t = parseIndex(parts[1]);
        const tok = (parts[2] ?? "").toLowerCase();
        if (!t.ok || tok === "")
          throw new Error(`${gate} needs a target qubit and an angle`);
        const target = t.value;
        if (tok === "theta") {
          hasTheta = true;
          gates.push({ gate, target, bound: true });
        } else {
          const angle = parseAngle(parts[2]); // original-case token for the message
          if (!angle.ok) throw new Error(`${gate}: bad angle "${parts[2]}"`);
          gates.push({ gate, target, theta: angle.value });
        }
        n = Math.max(n, target + 1);
      } else if (SINGLE.has(gate)) {
        const t = parseIndex(parts[1]);
        if (!t.ok) throw new Error(`${gate} needs a target qubit`);
        const target = t.value;
        gates.push({ gate, target });
        n = Math.max(n, target + 1);
      } else {
        throw new Error(`unknown gate "${parts[0]}"`);
      }
    }

    if (n < 1) n = 1;
    if (n > MAX_QUBITS) throw new Error(`circuit lab supports up to ${MAX_QUBITS} qubits`);
    return { n, gates, hasTheta };
  } catch (e) {
    return { n: 1, gates: [], hasTheta: false, error: (e as Error).message };
  }
}

export function opsFor(program: Program, theta: number): Op[] {
  return program.gates.map((g) => {
    if (g.gate === "CNOT") return { gate: "CNOT", target: g.target, control: g.control };
    if (ROT.has(g.gate))
      return { gate: g.gate, target: g.target, theta: g.bound ? theta : g.theta ?? 0 };
    return { gate: g.gate, target: g.target };
  });
}
