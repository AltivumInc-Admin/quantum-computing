// Adapter that turns a solved ```qchallenge into a spaced-repetition card.
// Pure functions only — no React, no storage, no clock — so the mapping from an
// objective grade to a review Rating is trivially unit-testable. The widget
// (challenge.tsx) and the store (review-store.ts) supply the effects.

import type { Rating } from "./review-schedule";

/**
 * Review-card id for a challenge, namespaced under `challenge:` so it can never
 * collide with an authored ```qcard id sharing the same `qc:card:` key space.
 */
export function challengeCardId(challengeId: string): string {
  return `challenge:${challengeId}`;
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
 * Review-card id for a predict-then-run Rep, namespaced under `predict:` so it
 * can never collide with a `challenge:` card (or an authored qcard) of the same id.
 */
export function predictCardId(id: string): string {
  return `predict:${id}`;
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

/**
 * Review-card id for a Bloch-target Rep, namespaced under `bloch:` so it can
 * never collide with a `challenge:`/`predict:` card (or an authored qcard) of
 * the same id. A Bloch-target solve is retryable like a challenge — the learner
 * adjusts and Checks again — so it maps to a rating through the same
 * ratingForSolve (clean first Check "good", any miss first "hard").
 */
export function blochCardId(id: string): string {
  return `bloch:${id}`;
}

/**
 * Review-card id for a cost-estimate Rep, namespaced under `cost:`. Like a
 * prediction, a cost estimate is one irreversible commit — once the breakdown
 * is revealed a retry is trivially correct — so it rates through
 * ratingForPrediction (correct "good", miss an "again" lapse).
 */
export function costCardId(id: string): string {
  return `cost:${id}`;
}
