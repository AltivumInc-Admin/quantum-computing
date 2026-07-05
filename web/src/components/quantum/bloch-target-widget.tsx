"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { parseBlochTarget } from "@/lib/bloch-target-schema";
import {
  blochTargetTruth,
  gradeBlochTarget,
  clampToleranceDeg,
  blochTargetReviewAnswer,
} from "@/lib/bloch-target-grade";
import { blochCardId, ratingForSolve } from "@/lib/challenge-review";
import { gradeCardIfDue, setCardContent } from "@/lib/review-store";
import { nextIntervalDays } from "@/lib/review-schedule";
import { singleQubitState, blochVector, probabilities } from "./math";
import { diracString } from "./state-readout";
import { BlochDial, BlochVectorSR } from "./bloch-dial";
import {
  Chip,
  ErrorCard,
  LabeledSlider,
  ProbBars,
  StateReadout,
  WidgetCard,
  primaryActionClass,
} from "./widget-ui";
import { usePrefersReducedMotion, useWebGL } from "./use-display-caps";
import { formatFixed, formatRadians } from "./format";

const BlochSphere3D = dynamic(() => import("./bloch-sphere-3d"), {
  ssr: false,
  // Reserve the sphere's exact footprint while the lazy three.js chunk loads,
  // so the first post-hydration dial->3D flip can't collapse the layout.
  loading: () => <div className="h-[180px] w-[180px] shrink-0" aria-hidden="true" />,
});

/**
 * A Bloch-target Rep rendered from a ```qblochtarget fenced block. The learner
 * drives the θ/φ sliders until the state vector sits on the target state —
 * shown as a target reticle on the 3D sphere (a dashed marker on the 2D dial
 * fallback), hidden until solved when the spec sets `blind` — then presses
 * Check. The placement is graded by great-circle angle (bloch-target-grade.ts)
 * and feeds the FSRS scheduler through the shared adapter: a clean first Check
 * schedules "good", a solve after any miss "hard" (blochCardId +
 * ratingForSolve). Misses report the angular distance, so every wrong Check
 * still teaches the geometry; moving a slider clears the stale readout.
 *
 * Data shape (JSON inside the fence):
 *   { "id": "...", "prompt": "...", "target": { "program": "H 0" },
 *     "toleranceDeg"?: 5, "hint"?: "...", "blind"?: false }
 */

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const fmtDeg = (deg: number) => `${formatFixed(deg, 1)}°`;
// Boundary-safe pairing for the miss line: the measured angle rounds UP and the
// tolerance rounds DOWN, so a genuine miss can never display as "Off by 5.0° —
// outside the 5.0° tolerance" (a real 5.03° miss shows 5.1°). The epsilon keeps
// float dust (90.000000000001°) from ceiling up a whole tenth.
const fmtDegCeil = (deg: number) => `${formatFixed(Math.ceil(deg * 10 - 1e-7) / 10, 1)}°`;
const fmtDegFloor = (deg: number) => `${formatFixed(Math.floor(deg * 10 + 1e-7) / 10, 1)}°`;

const SLIDER_ROW = "flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3";
const SLIDER_LABEL = "w-4 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300";

export function BlochTargetWidget({ source }: { source: string }) {
  const parsed = useMemo(() => parseBlochTarget(source), [source]);
  const spec = parsed.spec;
  const truthResult = useMemo<ReturnType<typeof blochTargetTruth>>(
    () => (spec ? blochTargetTruth(spec) : { error: "no spec" }),
    [spec],
  );
  const targetState = truthResult.truth?.targetState;

  // Every circuit starts at |0⟩, so the Rep does too: the learner drives the
  // vector from the north pole to the target (and can't solve by not moving —
  // the grader rejects targets within tolerance of |0⟩).
  const [theta, setTheta] = useState(0);
  const [phi, setPhi] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [solved, setSolved] = useState(false);
  const [solvedDeg, setSolvedDeg] = useState(0);
  const [missDeg, setMissDeg] = useState<number | null>(null);
  const [scheduled, setScheduled] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGL();
  // One persistent live region announces miss/solve outcomes: swapping text in
  // a mounted region is reliably announced, mounting a new region is not.
  const outcomeRef = useRef<HTMLDivElement>(null);

  const cardId = blochCardId(spec?.id ?? "invalid");
  const learnerState = useMemo(() => singleQubitState(theta, phi), [theta, phi]);
  const probs = useMemo(() => probabilities(learnerState), [learnerState]);

  // Cache content so /review can render this Rep as a recall card.
  useEffect(() => {
    if (spec && targetState) {
      setCardContent(cardId, {
        prompt: spec.prompt,
        answer: blochTargetReviewAnswer(targetState),
      });
    }
  }, [spec, targetState, cardId]);

  // Solving unmounts the focused Check button; move focus to the outcome so
  // keyboard users land on the announced result instead of falling to <body>.
  useEffect(() => {
    if (solved) outcomeRef.current?.focus();
  }, [solved]);

  if (!spec) return <ErrorCard label="bloch-target" message={parsed.error} />;
  if (!targetState) return <ErrorCard label="bloch-target" message={truthResult.error} />;

  const tolDeg = clampToleranceDeg(spec.toleranceDeg);
  const targetKet = diracString(targetState, 1);
  const showGhost = !spec.blind || solved;
  const show3D = !reduced && webgl;

  const onTheta = (v: number) => {
    setTheta(v);
    if (missDeg !== null) setMissDeg(null); // the readout described the old position
  };
  const onPhi = (v: number) => {
    setPhi(v);
    if (missDeg !== null) setMissDeg(null);
  };

  const check = () => {
    if (solved) return;
    const grade = gradeBlochTarget(learnerState, targetState, (tolDeg * Math.PI) / 180);
    if (grade.solved) {
      setSolved(true);
      setSolvedDeg(grade.angleDeg);
      setMissDeg(null);
      const graded = gradeCardIfDue(cardId, ratingForSolve(wrongAttempts));
      if (graded) setScheduled(nextIntervalDays(graded));
    } else {
      setWrongAttempts((w) => w + 1);
      setMissDeg(grade.angleDeg);
    }
  };

  return (
    <WidgetCard
      eyebrow="Bloch target"
      headerRight={
        solved ? (
          <span className="inline-flex items-center gap-1.5 rounded-chip bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-dark dark:text-accent-light">
            <CheckIcon />
            On target
          </span>
        ) : undefined
      }
    >
      <div className="px-4 pt-4 sm:px-5">
        <p className="text-[0.95rem] leading-relaxed text-gray-800 dark:text-gray-200">{spec.prompt}</p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {/* In blind mode the amplitudes ARE the answer (they encode θ), so the
              target ket stays hidden until solved — the prompt names the task. */}
          {(!spec.blind || solved) && <Chip>Target {targetKet}</Chip>}
          <Chip>within {fmtDegFloor(tolDeg)}</Chip>
          {spec.blind && <Chip>from memory</Chip>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 px-4 py-4 sm:px-5">
        {/* Polite live region, matching the qbloch builder's identical column. */}
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <ProbBars probs={probs} n={1} />
          <StateReadout state={learnerState} n={1} />
        </div>

        {/* The 3D canvas is aria-hidden, so it carries the dial's sr-only
            vector readout alongside; the target itself is named in the chips. */}
        {show3D ? (
          <div className="shrink-0">
            <BlochSphere3D state={learnerState} ghost={showGhost ? targetState : undefined} />
            <BlochVectorSR state={learnerState} />
          </div>
        ) : (
          <BlochDial
            state={learnerState}
            size={180}
            ghostVector={showGhost ? blochVector(targetState) : undefined}
          />
        )}
      </div>

      <LabeledSlider
        label={<>&#952;</>}
        value={theta}
        min={0}
        max={Math.PI}
        step={Math.PI / 60}
        onChange={onTheta}
        ariaLabel="Polar angle theta in radians"
        ariaValueText={`${theta.toFixed(2)} radians`}
        display={formatRadians(theta)}
        rowClassName={SLIDER_ROW}
        labelClassName={SLIDER_LABEL}
      />
      <LabeledSlider
        label={<>&#966;</>}
        value={phi}
        min={0}
        max={2 * Math.PI}
        step={Math.PI / 60}
        onChange={onPhi}
        ariaLabel="Azimuthal angle phi in radians"
        ariaValueText={`${phi.toFixed(2)} radians`}
        display={formatRadians(phi)}
        rowClassName={SLIDER_ROW}
        labelClassName={SLIDER_LABEL}
      />

      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 sm:px-5">
        {!solved && (
          <button
            type="button"
            onClick={check}
            className={`${primaryActionClass} inline-flex items-center gap-1.5`}
          >
            <CheckIcon />
            Check position
          </button>
        )}
        <div ref={outcomeRef} role="status" tabIndex={-1} className="focus:outline-none">
          {!solved && missDeg !== null && (
            <p className="mt-2 text-sm tabular-nums text-warm-dark dark:text-warm-light">
              Off by {fmtDegCeil(missDeg)} — outside the {fmtDegFloor(tolDeg)} tolerance.
            </p>
          )}
          {solved && (
            <>
              <p className="text-sm font-medium tabular-nums text-accent-dark dark:text-accent-light animate-fade-up">
                On target — {fmtDeg(solvedDeg)} from {targetKet}.
              </p>
              {scheduled !== null && (
                <p className="mt-1 text-xs text-caption animate-fade-up">
                  {scheduled <= 1
                    ? "Added to your review — back tomorrow."
                    : `Added to your review — back in ${scheduled} days.`}
                </p>
              )}
            </>
          )}
        </div>
        {/* Once earned, the hint stays: it teaches even after the readout clears. */}
        {!solved && wrongAttempts > 0 && spec.hint && (
          <p className="mt-2 text-sm leading-relaxed text-warm-dark dark:text-warm-light">
            {spec.hint}
          </p>
        )}
      </div>
    </WidgetCard>
  );
}
