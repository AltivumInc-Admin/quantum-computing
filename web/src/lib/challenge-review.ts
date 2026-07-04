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
