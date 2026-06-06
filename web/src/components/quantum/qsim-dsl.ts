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

import type { Op } from "./math";

export const MAX_QUBITS = 4;

export interface ParsedGate {
  gate: string;
  target: number;
  control?: number;
  angle?: number;
  bound?: boolean; // true if the angle is the slider-bound theta
}

export interface Program {
  n: number;
  gates: ParsedGate[];
  hasTheta: boolean;
  error?: string;
}

export const SINGLE = new Set(["H", "X", "Y", "Z", "S", "T", "I"]);
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
        n = Math.max(n, parseInt(parts[1], 10));
        continue;
      }

      const gate = parts[0].toUpperCase();

      if (gate === "CNOT") {
        const control = parseInt(parts[1], 10);
        const target = parseInt(parts[2], 10);
        if (Number.isNaN(control) || Number.isNaN(target))
          throw new Error("CNOT needs a control and a target qubit");
        gates.push({ gate, target, control });
        n = Math.max(n, control + 1, target + 1);
      } else if (ROT.has(gate)) {
        const target = parseInt(parts[1], 10);
        const tok = (parts[2] ?? "").toLowerCase();
        if (Number.isNaN(target) || tok === "")
          throw new Error(`${gate} needs a target qubit and an angle`);
        if (tok === "theta") {
          hasTheta = true;
          gates.push({ gate, target, bound: true });
        } else {
          const angle = parseFloat(tok);
          if (Number.isNaN(angle)) throw new Error(`${gate}: bad angle "${parts[2]}"`);
          gates.push({ gate, target, angle });
        }
        n = Math.max(n, target + 1);
      } else if (SINGLE.has(gate)) {
        const target = parseInt(parts[1], 10);
        if (Number.isNaN(target)) throw new Error(`${gate} needs a target qubit`);
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
      return { gate: g.gate, target: g.target, theta: g.bound ? theta : g.angle ?? 0 };
    return { gate: g.gate, target: g.target };
  });
}
