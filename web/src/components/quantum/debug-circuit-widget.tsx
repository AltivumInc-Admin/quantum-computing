"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { parseDebugCircuit } from "@/lib/debug-circuit-schema";
import { debugTruth, gradeDebug } from "@/lib/debug-circuit-grade";
import type { GradeResult } from "@/lib/challenge-grade";
import { gradeCardIfDue, setCardContent } from "@/lib/review-store";
import { cardIdFor, ratingForSolve, challengeReviewAnswer } from "@/lib/challenge-review";
import { nextIntervalDays } from "@/lib/review-schedule";
import { recordBest, getBest } from "@/lib/skill-measure";
import { usePersistentSolved } from "./use-persistent-solved";
import {
  BestGatesNote,
  CheckIcon,
  cardShell,
  ErrorCard,
  EyebrowLabel,
  ScheduleNote,
  VERDICT_STYLES,
  VerdictBadge,
} from "./widget-ui";

/**
 * A debug-a-circuit Rep rendered from a ```qdebug fenced block. The editor is
 * PREFILLED with a broken circuit; the learner repairs it and clicks Check.
 * Grading is the challenge kernel (state equality up to global phase) with a
 * debug-specific diagnostic: an answer still state-equal to the original
 * broken circuit is told "you haven't changed the bug yet" instead of burning
 * the hint. Retryable like a challenge, so a solve rates via ratingForSolve
 * (clean first Check "good", any genuine miss first "hard").
 */

export function DebugCircuitWidget({
  source,
  surface = "lesson",
}: {
  source: string;
  /**
   * "review" when mounted on /review: the persistent solved-once-ever badge is
   * suppressed (this surface asks for a fresh re-attempt) and the schedule
   * note reads "Reviewed" instead of "Added to your review".
   */
  surface?: "lesson" | "review";
}) {
  const parsed = useMemo(() => parseDebugCircuit(source), [source]);
  const spec = parsed.spec;
  // Author-time validation + both reference states, computed once per spec.
  const truth = useMemo(() => (spec ? debugTruth(spec) : undefined), [spec]);

  const [code, setCode] = useState(spec?.broken.program ?? "");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [resetNote, setResetNote] = useState(false);
  // Session-sticky solve so a post-solve Reset on /review can't un-complete
  // the badge while the "Reviewed" schedule note (accurately) stands.
  const [sessionSolved, setSessionSolved] = useState(false);
  const [solved, markSolved] = usePersistentSolved("debug", spec?.id ?? "invalid");
  const editorId = useId();

  const cardId = cardIdFor("debug", spec?.id ?? "invalid");
  // Miss counter in SESSIONSTORAGE, not a ref and not localStorage: a ref
  // resets on reload (Check wrong N times, reload, paste the fix -> a
  // laundered "good"), while a localStorage qc:* key would enter the ADDITIVE
  // cross-device sync and resurrect cleared counters from the server copy.
  // sessionStorage survives the reload that constitutes the laundering move,
  // never syncs, and expires with the tab.
  const attemptsKey = `qc-session:attempts:${cardId}`;
  const readAttempts = () => {
    try {
      return Number(sessionStorage.getItem(attemptsKey)) || 0;
    } catch {
      return 0;
    }
  };
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [solvedGates, setSolvedGates] = useState<number | null>(null);
  const [bestGates, setBestGates] = useState<number | null>(null);

  // Cache content — including the raw fence source — so /review can re-mount
  // this exact Rep as a LIVE re-attempt. The recall answer reuses the
  // challenge formatter: for a debug Rep too, "the answer" IS a correct
  // circuit, collapsed onto one inline-code line.
  useEffect(() => {
    if (spec && truth && !truth.error) {
      setCardContent(cardId, {
        prompt: spec.prompt,
        answer: challengeReviewAnswer(spec.target.program),
        kind: "debug",
        source,
      });
    }
  }, [spec, truth, cardId, source]);

  if (!spec || !truth) {
    return (
      <ErrorCard label="debug" message={parsed.error} className="my-8" />
    );
  }
  if (truth.error) {
    return (
      <ErrorCard label="debug" message={truth.error} className="my-8" />
    );
  }

  const onCheck = () => {
    const r = gradeDebug(code, spec, truth);
    setResult(r);
    setResetNote(false);
    if (r.status === "wrong") {
      // Only a genuine wrong answer counts toward difficulty: an "error"
      // (parse or disallowed gate) is a malformed attempt, and a Check of the
      // UNTOUCHED seed is reproducing the symptom, not answering — neither
      // may push the eventual clean fix from "good" to "hard".
      if (code !== spec.broken.program) {
        try {
          sessionStorage.setItem(attemptsKey, String(readAttempts() + 1));
        } catch {
          /* storage unavailable — difficulty inference degrades gracefully */
        }
      }
    } else if (r.status === "solved") {
      const graded = gradeCardIfDue(cardId, ratingForSolve(readAttempts()));
      if (graded) setScheduled(nextIntervalDays(graded));
      try {
        sessionStorage.removeItem(attemptsKey);
      } catch {
        /* ignore */
      }
      setSessionSolved(true);
      markSolved();
      if (r.metrics) {
        recordBest(cardId, { gates: r.metrics.gates });
        setSolvedGates(r.metrics.gates);
        setBestGates(getBest(cardId)?.gates ?? r.metrics.gates);
      }
    }
  };

  // Restore the original buggy circuit after the editor gets mangled. Keeps
  // the miss counter — a reset is part of the same struggle, not a fresh
  // session. The note swaps into the persistent status region so screen
  // readers hear the restore (a removed/unmounted verdict is never announced).
  const onReset = () => {
    setCode(spec.broken.program);
    setResult(null);
    setResetNote(true);
    setSolvedGates(null); // clear the "Fixed in N gates" caption with the verdict
  };

  const showSolved =
    (surface !== "review" && solved) || sessionSolved || result?.status === "solved";

  return (
    <div className={`not-prose my-8 overflow-hidden ${cardShell}`}>
      <div className="flex items-center justify-between gap-3 border-b border-(--bd) px-4 py-3 sm:px-5">
        <EyebrowLabel strong>
          Fix the circuit
        </EyebrowLabel>
        {showSolved && (
          <VerdictBadge tone="accent">Fixed</VerdictBadge>
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
          The circuit to fix
        </label>
        <textarea
          id={editorId}
          value={code}
          spellCheck={false}
          onChange={(e) => {
            setCode(e.target.value);
            // The verdict described the OLD code — especially "you haven't
            // changed the bug yet", which becomes a false claim the moment
            // the learner types (mirrors bloch-target's stale-readout clear).
            if (result !== null) setResult(null);
            if (resetNote) setResetNote(false);
            if (solvedGates !== null) setSolvedGates(null); // clear the stale "Fixed in N" caption
          }}
          rows={Math.max(3, code.split("\n").length + 1)}
          className="mt-3 w-full rounded-control border border-(--bd) bg-(--field) px-3 py-2.5 font-mono text-sm text-(--ink) focus-ring resize-y"
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onCheck}
            className="inline-flex items-center gap-1.5 rounded-control surface-accent px-3 py-1.5 text-sm font-medium interactive focus-ring"
          >
            <CheckIcon />
            Check
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-control border border-(--bd) px-3 py-1.5 text-sm font-medium text-(--mut) interactive focus-ring"
          >
            Reset to the broken circuit
          </button>
        </div>

        {/* Persistent outcome region — verdicts (and the reset note) are
            announced by TEXT SWAP inside an always-mounted role="status";
            mounting a fresh region per verdict is not reliably announced
            (the same fix bloch-target/cost-estimate/predict carry). */}
        <div role="status">
          {result && (
            <div
              className={`mt-3 rounded-control px-3.5 py-3 text-sm leading-relaxed animate-fade-up ${VERDICT_STYLES[result.status]}`}
            >
              {result.message}
            </div>
          )}
          {!result && resetNote && (
            <p className="mt-3 text-sm text-caption animate-fade-up">
              Editor restored to the original broken circuit.
            </p>
          )}
        </div>

        <div role="status">
          {scheduled !== null && <ScheduleNote days={scheduled} surface={surface} />}
          {solvedGates !== null && (
            <BestGatesNote verb="Fixed" gates={solvedGates} best={bestGates} />
          )}
        </div>
      </div>
    </div>
  );
}
