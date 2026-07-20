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
  // Pyodide is booting/running. This is a UI LIFECYCLE state, deliberately kept
  // out of `result`: GradeStatus is the grader's verdict vocabulary, and the
  // boot notice used to be published as a fabricated `{status:"wrong"}`, which
  // painted a pre-grade loading message in the warm "not quite" tone — and flipped
  // an already-solved learner's green panel to amber before grading even started.
  const [busy, setBusy] = useState(false);
  const [solved, markSolved] = usePersistentSolved(
    "challenge",
    spec?.id ?? "invalid",
    persist
  );
  const editorId = useId();
  const promptId = `${editorId}-prompt`;
  const gatesId = `${editorId}-gates`;
  const tierNoteId = `${editorId}-tier`;

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
    if (r.status !== "solved") {
      // Retire the previous solve's banners. Both render on a bare non-null
      // check, so without this a follow-up miss printed "Not quite …" directly
      // above "Added to your review" and "Solved in 2 gates" — the card claiming
      // the same attempt both failed and succeeded. The widget's own copy invites
      // exactly that follow-up ("Can you match it?"), and /review mounts this
      // widget precisely for a fresh re-attempt.
      setScheduled(null);
      setSolvedGates(null);
    }
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
    // `result` is deliberately NOT touched here: a run in flight must not
    // recolour the verdict the learner is still reading. The boot notice renders
    // from `busy` instead, in the neutral tone (see the status region below).
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
    // Guards double-submit without `disabled`, which would blur the button the
    // learner just pressed (a disabled control is not focusable) and drop focus
    // to <body> for the whole multi-second Pyodide boot, with nothing to restore
    // it. aria-busy carries the state to AT instead.
    if (busy) return;
    if (spec.tier === "py") {
      void runPy();
      return;
    }
    apply(gradeTs(code, spec));
  };

  const showSolved = (surface !== "review" && solved) || result?.status === "solved";

  // Only describe what is actually rendered — a dangling aria-describedby id is
  // ignored by some AT and reads as an empty description in others.
  const hasAllowedGates = (spec.allowedGates?.length ?? 0) > 0;
  const describedBy =
    [promptId, hasAllowedGates ? gatesId : null, spec.tier === "py" ? tierNoteId : null]
      .filter(Boolean)
      .join(" ");

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
        <p id={promptId} className="text-[0.95rem] leading-relaxed text-(--ink)">
          {spec.prompt}
        </p>

        {hasAllowedGates && (
          <p id={gatesId} className="mt-2 text-xs text-caption">
            Allowed gates:{" "}
            <span className="font-mono text-(--mut)">
              {spec.allowedGates!.join(", ")}
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
          // The same four attributes Monaco sets on its own textarea (the repo's
          // other Python input). spellCheck alone does NOT stop iOS/Android
          // auto-capitalization, autocorrect, or smart quotes — and this field
          // takes free-form Braket Python on the py tier, where a capitalized
          // `From` or a curly quote comes back as "Your code raised: invalid
          // syntax", blaming the learner for the keyboard.
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          // The prompt is the field's description; the gate whitelist is a HARD
          // submission constraint (gradeTs returns an error verdict, not a wrong
          // answer) and the py note is the only signal that this field wants
          // Python rather than the DSL. All three were unassociated siblings, so
          // a learner tabbing straight to the field heard none of them.
          aria-describedby={describedBy}
          onChange={(e) => {
            setCode(e.target.value);
            // The verdict and the gate-count caption described the OLD code, so
            // they become false claims the moment the learner types — worst
            // after a solve, where the card would keep asserting "Correct" over
            // a circuit the grader never saw. (Mirrors debug-circuit's and
            // bloch-target's stale-readout clears.) The persistent solved-once-
            // ever badge is NOT cleared: it is set-once by design.
            if (result !== null) setResult(null);
            if (solvedGates !== null) setSolvedGates(null);
            if (scheduled !== null) setScheduled(null);
          }}
          rows={Math.max(3, code.split("\n").length + 1)}
          className="mt-3 w-full rounded-control border border-(--bd) bg-(--field) px-3 py-2.5 font-mono text-sm text-(--ink) focus-ring resize-y"
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onCheck}
            // Not `disabled`: see onCheck. The control stays focusable so a
            // keyboard learner is not dumped at the top of the document for the
            // whole boot; onCheck's early return is the double-submit guard.
            aria-busy={busy}
            className={`inline-flex items-center gap-1.5 rounded-control surface-accent px-3 py-1.5 text-sm font-medium interactive focus-ring ${
              busy ? "opacity-60" : ""
            }`}
          >
            <CheckIcon />
            Check
          </button>
          {spec.tier === "py" && (
            <span id={tierNoteId} className="text-xs text-caption">
              graded with real qcsim in your browser
            </span>
          )}
        </div>

        {/* Persistent outcome region — the verdict, the interim boot notice and
            the schedule note all announce by TEXT SWAP inside one always-mounted
            role="status" (mounting a fresh region per verdict is not reliably
            announced; the same fix debug-circuit/bloch-target/predict carry). */}
        <div role="status">
          {result && (
            <div
              className={`mt-3 rounded-control px-3.5 py-3 text-sm leading-relaxed animate-fade-up ${VERDICT_STYLES[result.status]}`}
            >
              {result.message}
            </div>
          )}

          {busy && (
            // Neutral tone, matching the runnable editor's identical copy. This
            // is a loading state, never a verdict — it must not be tinted warm.
            <p className="mt-3 text-sm text-caption animate-fade-up">
              Booting Python (first run takes a few seconds)…
            </p>
          )}

          {scheduled !== null && <ScheduleNote days={scheduled} surface={surface} />}

          {solvedGates !== null && (
            <BestGatesNote verb="Solved" gates={solvedGates} best={bestGates} />
          )}
        </div>
      </div>
    </div>
  );
}
