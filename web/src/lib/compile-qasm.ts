// qsim -> OpenQASM 3.0, in EXACTLY the dialect the QPU submit path has proven
// on real hardware (the panel presets; first Garnet run 2026-07-15): an
// 'OPENQASM 3.0;' header, one 'qubit[N] q;' register, Braket-flavor lowercase
// gate names ('cnot', never 'cx'; no stdgates include), then 'bit[N] c;' and a
// whole-register 'c = measure q;'. The Lambda validates only shape (non-empty,
// <= 7,000 UTF-8 bytes); the dialect itself is enforced by Braket at
// CreateQuantumTask, where a mismatch costs the learner a confirm click and a
// refund round-trip — so this compiler emits nothing the device has not
// already accepted.
//
// Qubit indexing maps DIRECTLY: qsim qubit i -> q[i]. The TS kernel and Braket
// both read bitstrings qubit-0-first (math.ts pins that parity), so there is
// deliberately NO endianness conversion here — inserting one would silently
// flip multi-qubit outcome labels between the live sim and hardware results.

import { type ParsedGate, type Program } from "@/components/quantum/qsim-dsl";
import { utf8ByteLength } from "./utf8";

export type CompileResult =
  | { ok: true; qasm: string; bytes: number }
  | { ok: false; error: string };

/** Mirrors MAX_QASM_BYTES in lambda/qpu/qpu-core.mjs (held under the WAF's 8KB body cap). */
export const QASM_SUBMIT_BYTE_CAP = 7000;

const SINGLE_QASM: Record<string, string> = { X: "x", Y: "y", Z: "z", H: "h", S: "s", T: "t" };
const ROT_QASM: Record<string, string> = { RX: "rx", RY: "ry", RZ: "rz" };

/**
 * Rotation angles at up to 6 decimals (~3e-8 rad rounding — orders of
 * magnitude below device fidelity), trailing zeros trimmed for compactness,
 * -0 snapped to 0 so output is deterministic for the circuitHash provenance.
 */
function formatAngle(v: number): string {
  let s = v.toFixed(6).replace(/\.?0+$/, "");
  if (s === "" || s === "-" || s === "-0") s = "0";
  return s;
}

function gateLine(g: ParsedGate, theta: number | undefined): string | null | { error: string } {
  if (g.gate === "I") return null; // identity is physically a no-op — omitted
  if (g.gate === "CNOT") return `cnot q[${g.control}], q[${g.target}];`;
  const single = SINGLE_QASM[g.gate];
  if (single) return `${single} q[${g.target}];`;
  const rot = ROT_QASM[g.gate];
  if (rot) {
    // Parser guarantees bound gates only exist when hasTheta (checked by the
    // caller-facing guard below), and literal gates carry a finite theta.
    const angle = g.bound ? theta! : (g.theta ?? 0);
    return `${rot}(${formatAngle(angle)}) q[${g.target}];`;
  }
  // Drift tripwire: if the DSL grows a gate this map does not know, fail loud
  // at compile time instead of shipping a circuit Braket will reject post-confirm.
  return { error: `cannot compile gate "${g.gate}" to OpenQASM — DSL and compiler have drifted` };
}

export function compileToQasm(program: Program, theta?: number): CompileResult {
  if (program.error) return { ok: false, error: program.error };
  if (program.hasTheta && theta === undefined) {
    return { ok: false, error: "this circuit binds theta — pass the slider value to compile it" };
  }
  const lines: string[] = [];
  for (const g of program.gates) {
    const line = gateLine(g, theta);
    if (line === null) continue;
    if (typeof line !== "string") return { ok: false, error: line.error };
    lines.push(line);
  }
  const n = Math.max(1, program.n);
  const qasm = [`OPENQASM 3.0;`, `qubit[${n}] q;`, ...lines, `bit[${n}] c;`, `c = measure q;`].join(
    "\n",
  );
  return { ok: true, qasm, bytes: utf8ByteLength(qasm) };
}
