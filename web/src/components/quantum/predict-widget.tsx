"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parsePredict } from "@/lib/predict-schema";
import { predictionTruth, gradePrediction, predictReviewAnswer } from "@/lib/predict-grade";
import { predictCardId, ratingForPrediction } from "@/lib/challenge-review";
import { gradeCardIfDue, setCardContent } from "@/lib/review-store";
import { nextIntervalDays } from "@/lib/review-schedule";
import { basisLabel } from "./math";
import { parseProgram } from "./qsim-dsl";
import { usePersistentSolved } from "./use-persistent-solved";
import {
  CheckIcon,
  cardShell,
  ErrorCard,
  EyebrowLabel,
  GateChips,
  OPTION_BASE,
  OPTION_TONE,
  ProbBars,
  StateReadout,
  VerdictBadge,
} from "./widget-ui";

/**
 * A predict-then-run Rep rendered from a ```qpredict fenced block. The learner
 * sees a concrete circuit, commits a prediction about its outcome BEFORE the
 * simulation is revealed, then the result is shown and the prediction graded —
 * feeding the FSRS scheduler through the shared adapter (predictCardId +
 * ratingForPrediction). A correct prediction schedules the card as "good"; a miss
 * is an "again" lapse. Commit is one irreversible shot, so the controls lock.
 *
 * Data shape (JSON inside the fence):
 *   { "id": "...", "prompt": "...", "program": "H 0\nCNOT 0 1",
 *     "mode": "top-outcome" | "nonzero-states", "hint"?: "..." }
 */

// Composed from the shared shell (which already carries .glass's resting
// shadow — the appended shadow utility this used to repeat was a no-op).
const CARD = `not-prose my-8 overflow-hidden ${cardShell}`;

// Sizing only — the recipe and the tones come from widget-ui.
const OPTION_SIZE = "px-2.5 py-1.5";

export function PredictWidget({
  source,
  surface = "lesson",
}: {
  source: string;
  /** "review" when mounted on /review — the schedule note drops the "Added to your review" phrasing. */
  surface?: "lesson" | "review";
}) {
  const parsed = useMemo(() => parsePredict(source), [source]);
  const spec = parsed.spec;

  const truthResult = useMemo(
    () => (spec ? predictionTruth(spec) : { error: "no spec" as string | undefined }),
    [spec],
  );
  const truth = truthResult.truth;
  const program = useMemo(() => (spec ? parseProgram(spec.program) : null), [spec]);

  const cardId = predictCardId(spec?.id ?? "invalid");
  // The uniform solved-once-ever flag (qc:predict:<id>). Only a correct commit
  // marks it; the header chip stays a verdict of THIS commit (a pre-commit
  // "Correct" would misdescribe the fresh attempt), so the read is unused.
  const [, markSolved] = usePersistentSolved("predict", spec?.id ?? "invalid");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [committed, setCommitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [scheduled, setScheduled] = useState<number | null>(null);
  // Persistent live region + focus target for the commit outcome — mounting a
  // new role=status with its text announces inconsistently, and the commit
  // unmounts the focused Lock button (same pattern as bloch-target).
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (committed) outcomeRef.current?.focus();
  }, [committed]);

  // Cache content — including the raw fence source — so /review can re-mount
  // this Rep as a LIVE re-attempt (fresh mount = fresh prediction).
  useEffect(() => {
    if (spec && truth) {
      setCardContent(cardId, {
        prompt: spec.prompt,
        answer: predictReviewAnswer(truth, spec.mode),
        kind: "predict",
        source,
      });
    }
  }, [spec, truth, cardId, source]);

  if (!spec) {
    return (
      <ErrorCard
        label="predict"
        message={parsed.error ?? "invalid predict block"}
        className="my-8"
      />
    );
  }
  if (!program || program.error || !truth) {
    return (
      <ErrorCard
        label="predict"
        message={truthResult.error ?? program?.error ?? "invalid circuit"}
        className="my-8"
      />
    );
  }

  const n = truth.n;
  const single = spec.mode === "top-outcome";
  const options = Array.from({ length: 1 << n }, (_, i) => i);
  const truthSet = new Set(single ? truth.topIndices : truth.nonzeroIndices);

  const toggle = (i: number) => {
    if (committed) return;
    setSelected((prev) => {
      if (single) return new Set([i]);
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const commit = () => {
    if (committed || selected.size === 0) return;
    const pick: number | number[] = single ? [...selected][0] : [...selected];
    const isCorrect = gradePrediction(pick, truth, spec.mode);
    setCorrect(isCorrect);
    setCommitted(true);
    const graded = gradeCardIfDue(cardId, ratingForPrediction(isCorrect));
    if (graded) setScheduled(nextIntervalDays(graded));
    if (isCorrect) markSolved();
  };

  const optionTone = (i: number): string => {
    if (!committed) return selected.has(i) ? OPTION_TONE.selected : OPTION_TONE.neutral;
    if (truthSet.has(i)) return OPTION_TONE.correct; // reveal the truth
    if (selected.has(i)) return OPTION_TONE.wrong; // a wrong pick the learner made
    return OPTION_TONE.neutral;
  };

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3 border-b border-(--bd) px-4 py-3 sm:px-5">
        <EyebrowLabel strong>
          Predict
        </EyebrowLabel>
        {committed && (
          <VerdictBadge tone={correct ? "accent" : "warm"}>
            {correct ? "Correct" : "Not quite"}
          </VerdictBadge>
        )}
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-[0.95rem] leading-relaxed text-(--ink)">{spec.prompt}</p>

        <div className="mt-3 flex flex-wrap gap-1">
          <GateChips gates={program.gates} />
        </div>

        <fieldset className="mt-4 border-0 p-0 m-0" disabled={committed}>
          <legend className="text-[11px] text-caption mb-1.5">
            {single ? "Which single outcome is most likely?" : "Which basis states are reachable?"}
          </legend>
          {/* Single mode uses aria-pressed toggle buttons, not fake radios:
              role=radio without the roving-tabindex arrow-key contract
              contradicts what a screen reader announces. Multi mode keeps
              checkbox semantics — independent tab stops are correct there. */}
          <div className="flex flex-wrap gap-2" role={single ? undefined : "group"}>
            {options.map((i) => (
              <button
                key={i}
                type="button"
                role={single ? undefined : "checkbox"}
                aria-checked={single ? undefined : selected.has(i)}
                aria-pressed={single ? selected.has(i) : undefined}
                onClick={() => toggle(i)}
                disabled={committed}
                className={`${OPTION_BASE} ${OPTION_SIZE} ${optionTone(i)}`}
              >
                |{basisLabel(i, n)}⟩
              </button>
            ))}
          </div>
        </fieldset>

        {!committed ? (
          <button
            type="button"
            onClick={commit}
            disabled={selected.size === 0}
            className="mt-4 inline-flex items-center gap-1.5 rounded-control surface-accent px-3 py-1.5 text-sm font-medium interactive focus-ring disabled:opacity-60"
          >
            <CheckIcon />
            Lock in prediction
          </button>
        ) : (
          <>
            <div
              role="region"
              aria-label="Simulated outcome"
              className="mt-4 rounded-control border-l-2 border-accent/60 bg-accent/5 dark:bg-accent/10 px-3.5 py-3 animate-fade-up"
            >
              <EyebrowLabel strong className="mb-2 block">
                Simulated outcome
              </EyebrowLabel>
              <ProbBars probs={truth.probs} n={n} />
              <StateReadout state={truth.state} n={n} />
            </div>

            {spec.hint && !correct && (
              <p className="mt-3 text-sm leading-relaxed text-warm-dark dark:text-warm-light">{spec.hint}</p>
            )}
          </>
        )}

        {/* Persistent outcome region — verdict announced by text swap, focus
            lands here when the commit unmounts the Lock button. */}
        <div ref={outcomeRef} role="status" tabIndex={-1} className="focus:outline-none">
          {committed && (
            <p
              className={`mt-3 text-sm font-medium animate-fade-up ${
                correct
                  ? "text-accent-dark dark:text-accent-light"
                  : "text-warm-dark dark:text-warm-light"
              }`}
            >
              {correct
                ? "Correct prediction."
                : "Not quite — compare the simulated outcome above."}
            </p>
          )}
          {committed && scheduled !== null && (
            <p className="mt-1 text-xs text-caption animate-fade-up">
              {surface === "review"
                ? scheduled <= 1
                  ? "Reviewed — next review tomorrow."
                  : `Reviewed — next review in ${scheduled} days.`
                : scheduled <= 1
                  ? "Added to your review — back tomorrow."
                  : `Added to your review — back in ${scheduled} days.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
