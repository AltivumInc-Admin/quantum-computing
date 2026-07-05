"use client";

import { useEffect, useMemo, useState } from "react";
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
 * shown as a faint dashed ghost on the sphere (hidden until solved when the
 * spec sets `blind`) — then presses Check. The placement is graded by
 * great-circle angle (bloch-target-grade.ts) and feeds the FSRS scheduler
 * through the shared adapter: a clean first Check schedules "good", a solve
 * after any miss "hard" (blochCardId + ratingForSolve). Misses report the
 * angular distance, so every wrong Check still teaches the geometry.
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
  // vector from the north pole to the target (and can't solve by not moving).
  const [theta, setTheta] = useState(0);
  const [phi, setPhi] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [solved, setSolved] = useState(false);
  const [solvedDeg, setSolvedDeg] = useState(0);
  const [missDeg, setMissDeg] = useState<number | null>(null);
  const [scheduled, setScheduled] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGL();

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

  if (!spec) return <ErrorCard label="bloch-target" message={parsed.error} />;
  if (!targetState) return <ErrorCard label="bloch-target" message={truthResult.error} />;

  const tolDeg = clampToleranceDeg(spec.toleranceDeg);
  const targetKet = diracString(targetState, 1);
  const showGhost = !spec.blind || solved;
  const show3D = !reduced && webgl;

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
          <Chip>Target {targetKet}</Chip>
          <Chip>within {fmtDeg(tolDeg)}</Chip>
          {spec.blind && <Chip>from memory</Chip>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1">
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
        onChange={setTheta}
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
        onChange={setPhi}
        ariaLabel="Azimuthal angle phi in radians"
        ariaValueText={`${phi.toFixed(2)} radians`}
        display={formatRadians(phi)}
        rowClassName={SLIDER_ROW}
        labelClassName={SLIDER_LABEL}
      />

      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 sm:px-5">
        {!solved ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={check}
                className={`${primaryActionClass} inline-flex items-center gap-1.5`}
              >
                <CheckIcon />
                Check position
              </button>
              <p role="status" className="text-sm tabular-nums text-warm-dark dark:text-warm-light">
                {missDeg !== null &&
                  `Off by ${fmtDeg(missDeg)} — outside the ${fmtDeg(tolDeg)} tolerance.`}
              </p>
            </div>
            {missDeg !== null && spec.hint && (
              <p className="mt-2 text-sm leading-relaxed text-warm-dark dark:text-warm-light">
                {spec.hint}
              </p>
            )}
          </>
        ) : (
          <div className="animate-fade-up">
            <p role="status" className="text-sm font-medium tabular-nums text-accent-dark dark:text-accent-light">
              On target — {fmtDeg(solvedDeg)} from {targetKet}.
            </p>
            {scheduled !== null && (
              <p role="status" className="mt-1 text-xs text-caption">
                {scheduled <= 1
                  ? "Added to your review — back tomorrow."
                  : `Added to your review — back in ${scheduled} days.`}
              </p>
            )}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
