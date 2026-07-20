"use client";

import { useEffect, useMemo, useState } from "react";
import BlochSphere3D, { SPHERE_PX } from "./bloch-sphere-3d-lazy";
import { simulateSteps, probabilities, zeroState, basisLabel } from "./math";
import { parseProgram, opsFor } from "./qsim-dsl";
import { BlochDial, BlochVectorSR } from "./bloch-dial";
import {
  ErrorCard,
  GateChips,
  LabeledSlider,
  LiveStatus,
  ProbBars,
  StateReadout,
  WidgetCard,
} from "./widget-ui";
import { usePrefersReducedMotion, useWebGL } from "./use-display-caps";
import { formatRadians, percentSR } from "./format";

/**
 * Scrubbable, gate-by-gate state-evolution player rendered from a ```qscrub
 * fenced block in a GUIDE. Reuses the shared qsim DSL + the qcsim-parity kernel
 * (simulateSteps), so the final frame is identical to the static CircuitLab.
 * The single-qubit Bloch readout upgrades to a draggable 3D sphere when motion
 * is allowed and WebGL is present, falling back to the 2D BlochDial otherwise.
 */

const STEP_MS = 750;

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {playing ? (
        <path d="M8 5h3v14H8zM13 5h3v14h-3z" />
      ) : (
        <path d="M8 5v14l11-7z" />
      )}
    </svg>
  );
}

export function WavefunctionScrubber({ source }: { source: string }) {
  const program = useMemo(() => parseProgram(source), [source]);
  const [theta, setTheta] = useState(Math.PI / 2);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGL();

  const frames = useMemo(
    () => (program.error ? [] : simulateSteps(opsFor(program, theta), program.n)),
    [program, theta]
  );
  const lastStep = Math.max(0, frames.length - 1);
  // Clamp at render so a shrinking circuit can't leave the scrubber past the end
  // (no clamp effect needed).
  const safeStep = Math.min(step, lastStep);

  // Auto-advance while playing. The only state update happens asynchronously
  // inside the timeout; the effect body itself never calls setState.
  useEffect(() => {
    if (!playing || reduced || safeStep >= lastStep) return;
    const id = setTimeout(() => setStep((s) => Math.min(s + 1, lastStep)), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, safeStep, lastStep, reduced]);

  const isPlaying = playing && safeStep < lastStep;
  const togglePlay = () => {
    if (safeStep >= lastStep) {
      setStep(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  if (program.error) {
    return (
      <ErrorCard label="qsim parse" message={program.error} />
    );
  }

  const current = frames[safeStep] ?? zeroState(program.n);
  const probs = probabilities(current);
  const activeGate = safeStep - 1; // gate that produced the current frame (-1 = initial)
  // One concise announcement per settled step. Suppressed during playback so
  // auto-advance does not queue a readout every STEP_MS.
  let top = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[top]) top = i;
  const summary = `Step ${safeStep} of ${lastStep}. Most likely outcome ${basisLabel(top, program.n)} at ${percentSR(probs[top] * 100)}.`;
  const show3D = !reduced && webgl && program.n === 1;

  return (
    <WidgetCard
      eyebrow="Wavefunction scrubber"
      chips={
        <div className="flex flex-wrap gap-1">
          <GateChips gates={program.gates} activeIndex={activeGate} />
        </div>
      }
    >
      <LiveStatus>{isPlaying ? "" : summary}</LiveStatus>

      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Deliberately NOT a live region: StateReadout's two CopyButtons each
            own a role="status" span, so wrapping this column nested live
            regions inside one another. The concise LiveStatus above carries the
            announcement instead, matching circuit-lab and bloch-builder. */}
        <div className="min-w-0 flex-1">
          <ProbBars probs={probs} n={program.n} />
          <StateReadout state={current} n={program.n} />
        </div>

        {program.n === 1 &&
          (show3D ? (
            // The 3D canvas is aria-hidden; carry the dial's sr-only vector
            // readout alongside (outside the aria-live column to the left).
            <div className="shrink-0">
              <BlochSphere3D state={current} />
              <BlochVectorSR state={current} />
            </div>
          ) : (
            <BlochDial state={current} size={SPHERE_PX} />
          ))}
      </div>

      {/* Scrub timeline */}
      <LabeledSlider
        value={safeStep}
        min={0}
        max={lastStep}
        step={1}
        parse={(s) => parseInt(s, 10)}
        onChange={(v) => {
          setPlaying(false);
          setStep(v);
        }}
        ariaLabel="Step through the circuit"
        ariaValueText={`step ${safeStep} of ${lastStep}`}
        display={`step ${safeStep}/${lastStep}`}
        rowClassName="flex items-center gap-3 border-t border-(--bd) px-4 py-3"
        leading={
          !reduced && lastStep > 0 ? (
            <button
              type="button"
              onClick={togglePlay}
              // Action-named label swap ONLY — the media-transport convention.
              // Pairing it with aria-pressed announced "Pause animation, toggle
              // button, pressed" while playing, which reads as "paused is
              // engaged": the exact inverse of the state. The label plus the
              // icon already convey it unambiguously.
              aria-label={isPlaying ? "Pause animation" : "Play animation"}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent-dark hover:bg-accent/20 dark:text-accent-light interactive focus-ring"
            >
              <PlayIcon playing={isPlaying} />
            </button>
          ) : undefined
        }
      />

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
