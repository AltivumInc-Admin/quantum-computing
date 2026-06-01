"use client";

import { useId, useMemo, useState } from "react";
import {
  simulate,
  probabilities,
  blochVector,
  basisLabel,
  type Complex,
  type Op,
} from "./math";

/**
 * Inline, zero-boot quantum readout rendered from a ```qsim fenced block in a
 * GUIDE. Parses a tiny gate DSL, evolves the state with the qcsim-parity TS
 * kernel (math.ts), and shows amplitude bars, the Dirac-notation state, and a
 * Bloch dial (single qubit). An optional theta-bound rotation gets a slider.
 *
 * DSL (one instruction per line; '#' starts a comment):
 *   qubits 2          # optional; inferred from the highest qubit index
 *   H 0
 *   CNOT 0 1
 *   RY 0 theta        # 'theta' binds the gate to the slider
 *   RX 0 1.5708       # or a literal angle in radians
 */

const MAX_QUBITS = 4;

interface ParsedGate {
  gate: string;
  target: number;
  control?: number;
  angle?: number;
  bound?: boolean; // true if the angle is the slider-bound theta
}

interface Program {
  n: number;
  gates: ParsedGate[];
  hasTheta: boolean;
  error?: string;
}

const SINGLE = new Set(["H", "X", "Y", "Z", "S", "T", "I"]);
const ROT = new Set(["RX", "RY", "RZ"]);

function parseProgram(source: string): Program {
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

function opsFor(program: Program, theta: number): Op[] {
  return program.gates.map((g) => {
    if (g.gate === "CNOT") return { gate: "CNOT", target: g.target, control: g.control };
    if (ROT.has(g.gate))
      return { gate: g.gate, target: g.target, theta: g.bound ? theta : g.angle ?? 0 };
    return { gate: g.gate, target: g.target };
  });
}

function formatAmplitude(c: Complex): string {
  const [re, im] = c;
  const eps = 5e-3;
  const r = Math.abs(re) < eps ? 0 : re;
  const i = Math.abs(im) < eps ? 0 : im;
  if (i === 0) return r.toFixed(2);
  if (r === 0) return `${i.toFixed(2)}i`;
  return `(${r.toFixed(2)}${i >= 0 ? "+" : "-"}${Math.abs(i).toFixed(2)}i)`;
}

function diracString(state: Complex[], n: number): string {
  const terms = state
    .map((amp, idx) => ({ amp, idx }))
    .filter(({ amp }) => amp[0] * amp[0] + amp[1] * amp[1] > 1e-6)
    .map(({ amp, idx }) => `${formatAmplitude(amp)}|${basisLabel(idx, n)}⟩`);
  return terms.length ? terms.join("  +  ") : "0";
}

function BlochDial({ state }: { state: Complex[] }) {
  const { x, y, z } = blochVector(state);
  const size = 132;
  const c = size / 2;
  const r = 52;
  // Project onto the X (right = |+>) / Z (up = |0>) plane.
  const px = c + r * x;
  const py = c - r * z;
  const axis = "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="text-accent shrink-0"
      role="img"
      aria-label={`Bloch vector x ${x.toFixed(2)}, y ${y.toFixed(2)}, z ${z.toFixed(2)}`}
    >
      <circle cx={c} cy={c} r={r} className="fill-none stroke-gray-300 dark:stroke-gray-600" strokeWidth={1} />
      <line x1={c} y1={c - r} x2={c} y2={c + r} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
      <line x1={c - r} y1={c} x2={c + r} y2={c} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
      {/* state vector */}
      <line x1={c} y1={c} x2={px} y2={py} stroke={axis} strokeWidth={2} strokeLinecap="round" />
      <circle cx={px} cy={py} r={4} fill={axis} />
      <circle cx={c} cy={c} r={2.5} className="fill-gray-400 dark:fill-gray-500" />
      <text x={c} y={c - r - 4} textAnchor="middle" className="fill-gray-400 text-[9px] font-mono">|0⟩</text>
      <text x={c} y={c + r + 11} textAnchor="middle" className="fill-gray-400 text-[9px] font-mono">|1⟩</text>
      <text x={c + r + 2} y={c + 3} textAnchor="start" className="fill-gray-400 text-[9px] font-mono">|+⟩</text>
      <text x={c - r - 2} y={c + 3} textAnchor="end" className="fill-gray-400 text-[9px] font-mono">|−⟩</text>
    </svg>
  );
}

export function CircuitLab({ source }: { source: string }) {
  const program = useMemo(() => parseProgram(source), [source]);
  const [theta, setTheta] = useState(Math.PI / 2);
  const sliderId = useId();

  const sim = useMemo(() => {
    if (program.error) return { error: program.error };
    try {
      const state = simulate(opsFor(program, theta), program.n);
      return { state, probs: probabilities(state) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [program, theta]);

  const gateChips = program.gates.map((g, i) => {
    const label =
      g.gate === "CNOT"
        ? `CNOT ${g.control}→${g.target}`
        : g.bound
          ? `${g.gate}(θ) q${g.target}`
          : g.angle !== undefined
            ? `${g.gate}(${g.angle.toFixed(2)}) q${g.target}`
            : `${g.gate} q${g.target}`;
    return (
      <span
        key={i}
        className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300"
      >
        {label}
      </span>
    );
  });

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          Live circuit
        </span>
        <div className="flex flex-wrap gap-1">{gateChips}</div>
      </div>

      {"error" in sim ? (
        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
          qsim parse error: {sim.error}
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-6 px-4 py-4">
          <div className="flex-1 min-w-0">
            <div className="space-y-1.5">
              {sim.probs!.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                    |{basisLabel(idx, program.n)}&#10217;
                  </span>
                  <span className="relative h-3 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-200"
                      style={{ width: `${(p * 100).toFixed(2)}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {(p * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 font-mono text-sm text-gray-700 dark:text-gray-200 break-words">
              <span className="text-gray-400 dark:text-gray-500">|&#968;&#10217; = </span>
              <span className="text-accent dark:text-accent-light">{diracString(sim.state!, program.n)}</span>
            </p>
          </div>

          {program.n === 1 && <BlochDial state={sim.state!} />}
        </div>
      )}

      {program.hasTheta && !("error" in sim) && (
        <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3">
          <label htmlFor={sliderId} className="font-mono text-sm text-gray-600 dark:text-gray-300">
            &#952;
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={2 * Math.PI}
            step={Math.PI / 60}
            value={theta}
            onChange={(e) => setTheta(parseFloat(e.target.value))}
            className="flex-1 accent-accent focus-ring rounded-full"
            aria-label="Rotation angle theta in radians"
          />
          <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {theta.toFixed(2)} rad
          </span>
        </div>
      )}
    </div>
  );
}
