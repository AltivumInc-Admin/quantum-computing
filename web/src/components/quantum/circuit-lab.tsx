"use client";

import { useMemo, useState } from "react";
import { simulate, probabilities } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { BlochDial } from "./bloch-dial";
import { GateChips, LabeledSlider, ProbBars, StateReadout, WidgetCard } from "./widget-ui";

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
        <LabeledSlider
          label={<>&#952;</>}
          value={theta}
          min={0}
          max={2 * Math.PI}
          step={Math.PI / 60}
          onChange={setTheta}
          ariaLabel="Rotation angle theta in radians"
          ariaValueText={`${theta.toFixed(2)} radians`}
          display={`${theta.toFixed(2)} rad`}
          rowClassName="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3"
          labelClassName="font-mono text-sm text-gray-600 dark:text-gray-300"
        />
      )}
    </WidgetCard>
  );
}
