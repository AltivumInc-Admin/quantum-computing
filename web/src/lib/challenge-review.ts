// Adapter that turns a solved ```qchallenge into a spaced-repetition card.
// Pure functions only — no React, no storage, no clock — so the mapping from an
// objective grade to a review Rating is trivially unit-testable. The widget
// (challenge.tsx) and the store (review-store.ts) supply the effects.

import type { Rating } from "./review-schedule";
import type { CardKind } from "./review-store";

/**
 * Review-card id for a graded Rep: `<kind>:<id>`, so a Rep can never collide
 * with an authored ```qcard — or with another kind's Rep — sharing the same
 * `qc:card:` key space.
 *
 * Typed against `CardKind`, deliberately mirroring `solvedFlagKey(kind, id)` in
 * use-persistent-solved.ts (which builds the sibling `qc:<kind>:<id>` flag key
 * from the same vocabulary). The six one-line per-kind builders this replaces
 * took and returned bare `string`, so nothing tied the prefix vocabulary to the
 * union: a seventh kind could be added to CardKind, KIND_LABELS and LIVE_WIDGETS
 * while its id builder silently used a prefix that matched nothing.
 *
 * Each widget passes the SAME literal it already passes to usePersistentSolved
 * on the adjacent line, so the two key spaces are provably built from one
 * typed vocabulary.
 */
export function cardIdFor(kind: CardKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * `cardIdFor("challenge", id)`. Retained as a named alias only because
 * challenge.tsx is owned by a concurrent workstream; migrate it to `cardIdFor`
 * and delete this.
 */
export function challengeCardId(challengeId: string): string {
  return cardIdFor("challenge", challengeId);
}

/**
 * Map an objective challenge solve to a spaced-repetition rating. The grader is
 * binary (solved/wrong), so difficulty is inferred from how many genuine wrong
 * attempts preceded the solve: a clean first solve is "good"; any struggle is
 * "hard". "easy" and "again" are reserved for the learner's explicit self-rating
 * on the /review page, where they mean something the grader can't observe.
 */
export function ratingForSolve(wrongAttempts: number): Rating {
  return wrongAttempts <= 0 ? "good" : "hard";
}

/**
 * A human-readable recall answer derived from a challenge's target circuit, so
 * the /review page can render the challenge as a recall card. The multi-line DSL
 * is collapsed onto one inline-code line because ReviewCard renders `code` spans
 * but not fenced blocks, and a raw newline would collapse to a space in the <p>.
 */
export function challengeReviewAnswer(program: string): string {
  const steps = program
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return steps.length
    ? "One correct circuit: `" + steps.join("; ") + "`"
    : "See the lesson for the target circuit.";
}

/**
 * Map a predict-then-run commit to a rating. Unlike a challenge, a prediction is
 * one irreversible shot — once the outcome is revealed a retry is trivially
 * correct — so ratingForSolve's retry model does not apply: a correct prediction
 * is "good", and a genuine miss is exactly an FSRS lapse ("again").
 */
export function ratingForPrediction(correct: boolean): Rating {
  return correct ? "good" : "again";
}

// Which rating adapter each remaining kind uses, recorded once instead of in
// six near-identical builder docstrings:
//   bloch  — retryable like a challenge (adjust and Check again) -> ratingForSolve
//   debug  — retryable like a challenge (edit the broken circuit) -> ratingForSolve,
//            and its recall answer reuses challengeReviewAnswer, since for a debug
//            Rep too "the answer" is a correct circuit
//   cost   — one irreversible commit; once the breakdown is revealed a retry is
//            trivially correct -> ratingForPrediction
//   expect — one irreversible commit, for the same reason -> ratingForPrediction
