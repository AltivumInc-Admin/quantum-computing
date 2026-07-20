"use client";

import { useMemo, useState } from "react";
import { basisLabel, simulate, probabilities } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { BlochDial } from "./bloch-dial";
import {
  ErrorCard,
  GateChips,
  LabeledSlider,
  LiveStatus,
  ProbBars,
  StateReadout,
  WidgetCard,
} from "./widget-ui";
import { formatRadians, percentSR } from "./format";

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

  // ONE short line for screen readers, derived from the same state: the
  // dominant basis outcome. Announcing the full bar list plus the Dirac string
  // per slider step is a paragraph per tick; this is a sentence.
  const summary = useMemo(() => {
    if ("error" in sim || !sim.probs) return "";
    let top = 0;
    for (let i = 1; i < sim.probs.length; i++) if (sim.probs[i] > sim.probs[top]) top = i;
    return `Most likely outcome ${basisLabel(top, program.n)} at ${percentSR(sim.probs[top] * 100)}.`;
  }, [sim, program.n]);

  // The shared failure card, same as ShotsSampler and WavefunctionScrubber
  // render for the identical parseProgram error. Previously a bare <p> inside
  // the card, whose chips row was always empty anyway (parseProgram returns
  // gates: [] on error) and whose theta slider could never appear.
  if ("error" in sim) {
    return <ErrorCard label="qsim parse" message={sim.error} />;
  }

  return (
    <WidgetCard
      eyebrow="Live circuit"
      chips={
        <div className="flex flex-wrap gap-1">
          <GateChips gates={program.gates} />
        </div>
      }
    >
      <LiveStatus>{summary}</LiveStatus>

      <div className="flex flex-col sm:flex-row gap-6 px-4 py-4">
        {/* Deliberately NOT a live region. It used to wrap the whole
            probability list plus the full Dirac string, so every theta tick
            (pi/60 => 60 steps per drag) re-announced all of it — and
            StateReadout's two CopyButtons each carry their own role="status"
            span, making these NESTED live regions with implementation-defined
            behavior. The concise LiveStatus above carries the announcement
            instead, matching noise-visualizer's deltaSummary pattern. */}
        <div className="flex-1 min-w-0">
          <ProbBars probs={sim.probs!} n={program.n} />
          <StateReadout state={sim.state!} n={program.n} />
        </div>

        {program.n === 1 && <BlochDial state={sim.state!} />}
      </div>

      {program.hasTheta && (
        <LabeledSlider
          label={<>&#952;</>}
          value={theta}
          min={0}
          max={2 * Math.PI}
          step={Math.PI / 60}
          onChange={setTheta}
          ariaLabel="Rotation angle theta in radians"
          ariaValueText={`${theta.toFixed(2)} radians`}
          display={formatRadians(theta)}
          rowClassName="flex items-center gap-3 border-t border-(--bd) px-4 py-3"
          labelClassName="font-mono text-sm text-caption"
        />
      )}
    </WidgetCard>
  );
}
