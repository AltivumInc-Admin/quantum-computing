"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BlochSphere3D, { SPHERE_PX } from "@/components/quantum/bloch-sphere-3d-lazy";
import { simulateSteps, probabilities, zeroState } from "@/components/quantum/math";
import { opsFor, type ParsedGate, type Program } from "@/components/quantum/qsim-dsl";
import { BlochDial, BlochVectorSR } from "@/components/quantum/bloch-dial";
import { GateChips, LabeledSlider, ProbBars, StateReadout } from "@/components/quantum/widget-ui";
import { usePrefersReducedMotion, useWebGL } from "@/components/quantum/use-display-caps";
import { Panel } from "@/components/workspace/panel";

/**
 * The live readout half of the bench: the wavefunction-scrubber pattern
 * (simulateSteps frames + timeline slider + play button + GateChips activeIndex)
 * rehosted in a Panel and fed the bench's LAST-GOOD program, so it never blanks
 * on a parse error. One bench-specific behavior on top of the scrubber: while
 * the learner is parked on the final frame, adding gates FOLLOWS the end (the
 * live-final-state feel that makes a run button unnecessary).
 */

const STEP_MS = 750;

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {playing ? <path d="M8 5h3v14H8zM13 5h3v14h-3z" /> : <path d="M8 5v14l11-7z" />}
    </svg>
  );
}

/** The instruction as the learner wrote it, for the slider's aria-valuetext. */
function instructionText(g: ParsedGate): string {
  if (g.gate === "CNOT") return `CNOT ${g.control} ${g.target}`;
  if (g.bound) return `${g.gate} ${g.target} theta`;
  if (g.theta !== undefined) return `${g.gate} ${g.target} ${g.theta}`;
  return `${g.gate} ${g.target}`;
}

export function StatePanel({ program, theta }: { program: Program; theta: number }) {
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGL();

  const frames = useMemo(
    () => simulateSteps(opsFor(program, theta), program.n),
    [program, theta],
  );
  const lastStep = frames.length - 1; // === program.gates.length

  const [step, setStep] = useState(lastStep);
  const [playing, setPlaying] = useState(false);
  // The learner's INTENT, not a derived value: true while they are parked on the
  // final frame. Tracked so an edit that changes the gate count can decide to
  // follow the new end (intent: watch the live result) instead of snapping an
  // intentionally scrubbed-back position.
  const atEnd = useRef(true);

  // Follow the end / clamp when the circuit changes length. Declared BEFORE the
  // intent recorder below so it reads the intent from before the edit — and read
  // EAGERLY here, not inside the setStep updater: React evaluates updaters when
  // it processes the update, by which time the recorder (which runs later in
  // this same effect flush) would already have overwritten the ref.
  useEffect(() => {
    const followEnd = atEnd.current;
    setStep((s) => (followEnd ? lastStep : Math.min(s, lastStep)));
  }, [lastStep]);

  const safeStep = Math.min(step, lastStep);

  useEffect(() => {
    atEnd.current = safeStep >= lastStep;
  });

  // Auto-advance while playing; never autoplays on mount (playing starts false)
  // and stands down entirely under prefers-reduced-motion.
  useEffect(() => {
    if (!playing || reduced || safeStep >= lastStep) return;
    const id = setTimeout(() => setStep((s) => Math.min(s + 1, lastStep)), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, reduced, safeStep, lastStep]);

  const isPlaying = playing && safeStep < lastStep;
  const togglePlay = () => {
    if (safeStep >= lastStep) {
      setStep(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  const current = frames[safeStep] ?? zeroState(program.n);
  const probs = probabilities(current);
  const show3D = !reduced && webgl && program.n === 1;

  const scrubValueText =
    safeStep === 0
      ? `initial state |${"0".repeat(program.n)}⟩`
      : `after gate ${safeStep} of ${lastStep}: ${instructionText(program.gates[safeStep - 1])}`;

  return (
    <Panel title="State" id="state">
      {program.gates.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <GateChips gates={program.gates} activeIndex={safeStep - 1} />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-6 sm:flex-row">
        {/* aria-live goes quiet while auto-playing so AT isn't spammed per frame. */}
        <div className="min-w-0 flex-1" role="status" aria-live={isPlaying ? "off" : "polite"}>
          <ProbBars probs={probs} n={program.n} />
          <StateReadout state={current} n={program.n} />
        </div>

        {program.n === 1 &&
          (show3D ? (
            // The 3D canvas is aria-hidden; the sr vector twin lives OUTSIDE the
            // live region on the left so it reads once, not per frame.
            <div className="shrink-0">
              <BlochSphere3D state={current} />
              <BlochVectorSR state={current} />
            </div>
          ) : (
            <BlochDial state={current} size={SPHERE_PX} />
          ))}
      </div>

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
        ariaValueText={scrubValueText}
        display={`step ${safeStep}/${lastStep}`}
        rowClassName="mt-4 flex items-center gap-3"
        leading={
          !reduced && lastStep > 0 ? (
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause animation" : "Play animation"}
              aria-pressed={isPlaying}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent-dark hover:bg-accent/20 dark:text-accent-light interactive focus-ring"
            >
              <PlayIcon playing={isPlaying} />
            </button>
          ) : undefined
        }
      />

      <p className="mt-3 text-xs text-caption">
        Ideal simulation — exact amplitudes, no noise.
      </p>
    </Panel>
  );
}
