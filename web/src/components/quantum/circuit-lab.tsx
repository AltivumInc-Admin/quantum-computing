"use client";

import { useId, useMemo, useState } from "react";
import { simulate, probabilities, basisLabel } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { BlochDial } from "./bloch-dial";
import { diracString, toPythonState } from "./state-readout";
import { CopyButton } from "../copy-button";

/**
 * Inline, zero-boot quantum readout rendered from a ```qsim fenced block in a
 * GUIDE. Parses the shared gate DSL (qsim-dsl.ts), evolves the state with the
 * qcsim-parity TS kernel (math.ts), and shows amplitude bars, the
 * Dirac-notation state, and a Bloch dial (single qubit). An optional
 * theta-bound rotation gets a slider.
 */

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
            <div className="mt-4 flex items-start gap-2">
              <p className="min-w-0 flex-1 font-mono text-sm text-gray-700 dark:text-gray-200 break-words">
                <span className="text-gray-400 dark:text-gray-500">|&#968;&#10217; = </span>
                <span className="text-accent dark:text-accent-light">{diracString(sim.state!, program.n)}</span>
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <CopyButton getText={() => diracString(sim.state!, program.n)} label="Copy state notation" />
                <span className="flex items-center">
                  <CopyButton getText={() => toPythonState(sim.state!)} label="Copy state as runnable Python" />
                  <span className="-ml-1 rounded bg-accent/10 px-1 py-0.5 font-mono text-[9px] text-accent-dark dark:text-accent-light">py</span>
                </span>
              </div>
            </div>
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
            className="slider flex-1 focus-ring"
            aria-label="Rotation angle theta in radians"
            aria-valuetext={`${theta.toFixed(2)} radians`}
          />
          <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {theta.toFixed(2)} rad
          </span>
        </div>
      )}
    </div>
  );
}
