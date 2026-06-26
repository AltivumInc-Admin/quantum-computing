"use client";

import { useId, useMemo, useState } from "react";
import { simulate, probabilities } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { BlochDial } from "./bloch-dial";
import { GateChips, ProbBars, StateReadout, WidgetCard } from "./widget-ui";

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

  return (
    <WidgetCard
      eyebrow="Live circuit"
      chips={
        <div className="flex flex-wrap gap-1">
          <GateChips gates={program.gates} />
        </div>
      }
    >
      {"error" in sim ? (
        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
          qsim parse error: {sim.error}
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-6 px-4 py-4">
          <div className="flex-1 min-w-0" role="status" aria-live="polite">
            <ProbBars probs={sim.probs!} n={program.n} />
            <StateReadout state={sim.state!} n={program.n} />
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
    </WidgetCard>
  );
}
