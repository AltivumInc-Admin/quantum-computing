"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { parseChallenge } from "@/lib/challenge-schema";
import { gradeTs, type GradeResult } from "@/lib/challenge-grade";
import { gradeCardIfDue, setCardContent } from "@/lib/review-store";
import { challengeCardId, ratingForSolve, challengeReviewAnswer } from "@/lib/challenge-review";
import { nextIntervalDays } from "@/lib/review-schedule";
import { recordBest, getBest } from "@/lib/skill-measure";
import { usePersistentSolved } from "./use-persistent-solved";
import {
  CheckIcon,
  cardShell,
  ErrorCard,
  EyebrowLabel,
  VERDICT_STYLES,
  VerdictBadge,
} from "./widget-ui";

/**
 * A self-checking coding challenge rendered from a ```qchallenge fenced block.
 * The learner writes a circuit in the shared qsim DSL and clicks Check; Tier-A
 * grading runs entirely in-browser via the qcsim-parity kernel, comparing the
 * resulting state vector to the target up to global phase. No backend, no login.
 * Tier "py" defers to the Pyodide grader (free-form Braket Python), loaded
 * lazily only when such a challenge is checked.
 */

export function Challenge({
  source,
  surface = "lesson",
  persist = true,
}: {
  source: string;
  /**
   * "review" when mounted on /review: the persistent solved-once-ever badge is
   * suppressed (this surface is asking for a fresh re-attempt, so "Solved"
   * would claim the review is already done) and the schedule note drops the
   * "Added to your review" phrasing — the card is already there.
   */
  surface?: "lesson" | "review";
  /**
   * false for non-curriculum mounts (the /e2e-fixtures pages): grading still
   * works, but NOTHING is written to localStorage — no card content on mount,
   * no FSRS card or solved flag on solve. Without this, anyone who visits or
   * solves a fixture gets phantom qc:* keys that the additive cross-device
   * sync then replicates to every device forever (there is no card deletion).
   */
  persist?: boolean;
}) {
  const parsed = useMemo(() => parseChallenge(source), [source]);
  const spec = parsed.spec;

  const [code, setCode] = useState(spec?.starter ?? "");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [solved, markSolved] = usePersistentSolved(
    "challenge",
    spec?.id ?? "invalid",
    persist
  );
  const editorId = useId();

  const cardId = challengeCardId(spec?.id ?? "invalid");
  const wrongAttempts = useRef(0);
  const [scheduled, setScheduled] = useState<number | null>(null);
  // The shortest-solution skill measurement: this solve's gate count + the
  // personal best (which this solve may have just lowered).
  const [solvedGates, setSolvedGates] = useState<number | null>(null);
  const [bestGates, setBestGates] = useState<number | null>(null);

  // Cache the challenge's content — including the raw fence source — so /review
  // can re-mount this exact challenge as a LIVE re-attempt (falling back to a
  // recall card for content cached before `kind`/`source` existed).
  useEffect(() => {
    if (spec && persist) {
      setCardContent(cardId, {
        prompt: spec.prompt,
        answer: challengeReviewAnswer(spec.target.program),
        kind: "challenge",
        source,
      });
    }
  }, [spec, cardId, source, persist]);

  if (!spec) {
    return <ErrorCard label="challenge" message={parsed.error} className="my-8" />;
  }

  const apply = (r: GradeResult) => {
    setResult(r);
    if (r.status === "wrong") {
      // Only a genuine wrong answer counts toward difficulty; an "error" (parse
      // or disallowed gate) is a malformed attempt, not a wrong answer.
      wrongAttempts.current += 1;
    } else if (r.status === "solved") {
      if (persist) {
        const graded = gradeCardIfDue(cardId, ratingForSolve(wrongAttempts.current));
        if (graded) setScheduled(nextIntervalDays(graded));
        markSolved();
        if (r.metrics) {
          recordBest(cardId, { gates: r.metrics.gates });
          setSolvedGates(r.metrics.gates);
          setBestGates(getBest(cardId)?.gates ?? r.metrics.gates);
        }
      }
      wrongAttempts.current = 0;
    }
  };

  const runPy = async () => {
    setBusy(true);
    setResult({ status: "wrong", message: "Booting Python (first run takes a few seconds)…" });
    try {
      const { gradePy } = await import("@/lib/pyodide-grader");
      apply(await gradePy(code, spec));
    } catch (e) {
      setResult({ status: "error", message: `Python grader failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const onCheck = () => {
    if (spec.tier === "py") {
      void runPy();
      return;
    }
    apply(gradeTs(code, spec));
  };

  const showSolved = (surface !== "review" && solved) || result?.status === "solved";

  return (
    <div className={`not-prose my-8 overflow-hidden ${cardShell}`}>
      <div className="flex items-center justify-between gap-3 border-b border-(--bd) px-4 py-3 sm:px-5">
        <EyebrowLabel strong>
          Your turn
        </EyebrowLabel>
        {showSolved && (
          <VerdictBadge tone="accent">Solved</VerdictBadge>
        )}
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-[0.95rem] leading-relaxed text-(--ink)">
          {spec.prompt}
        </p>

        {spec.allowedGates && spec.allowedGates.length > 0 && (
          <p className="mt-2 text-xs text-caption">
            Allowed gates:{" "}
            <span className="font-mono text-(--mut)">
              {spec.allowedGates.join(", ")}
            </span>
          </p>
        )}

        <label htmlFor={editorId} className="sr-only">
          Your circuit
        </label>
        <textarea
          id={editorId}
          value={code}
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
          rows={Math.max(3, code.split("\n").length + 1)}
          className="mt-3 w-full rounded-control border border-(--bd) bg-(--field) px-3 py-2.5 font-mono text-sm text-(--ink) focus-ring resize-y"
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onCheck}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-control surface-accent px-3 py-1.5 text-sm font-medium interactive focus-ring disabled:opacity-60"
          >
            <CheckIcon />
            Check
          </button>
          {spec.tier === "py" && (
            <span className="text-xs text-caption">
              graded with real qcsim in your browser
            </span>
          )}
        </div>

        {result && (
          <div
            role="status"
            className={`mt-3 rounded-control px-3.5 py-3 text-sm leading-relaxed animate-fade-up ${VERDICT_STYLES[result.status]}`}
          >
            {result.message}
          </div>
        )}

        {scheduled !== null && (
          <p role="status" className="mt-2 text-xs text-caption animate-fade-up">
            {surface === "review"
              ? scheduled <= 1
                ? "Reviewed — next review tomorrow."
                : `Reviewed — next review in ${scheduled} days.`
              : scheduled <= 1
                ? "Added to your review — back tomorrow."
                : `Added to your review — back in ${scheduled} days.`}
          </p>
        )}

        {solvedGates !== null && (
          <p className="mt-2 text-xs text-caption tabular-nums animate-fade-up">
            Solved in {solvedGates} gate{solvedGates === 1 ? "" : "s"}
            {bestGates !== null && bestGates < solvedGates
              ? ` — your best is ${bestGates}. Can you match it?`
              : " — your best."}
          </p>
        )}
      </div>
    </div>
  );
}
