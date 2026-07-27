/**
 * Public API for the "Ask the margin" lesson tutor's grounding/prompt logic.
 *
 * The implementation is single-sourced in lambda/tutor/tutor-core.mjs (so the
 * Lambda and the corpus builder import the exact same code). A prebuild step
 * (web `gen:tutor-core`, run by the pretest/prebuild hooks) copies that module
 * into the gitignored ./tutor-core.generated.ts, which this file re-exports.
 * There is no manual "keep in sync" — this module just re-exports the one copy.
 *
 * Only what the WEB actually consumes is re-exported. The prompt builders and
 * the section cap have no web caller: their behaviour is pinned where it runs,
 * in lambda/tutor/tutor-core.test.mjs, and re-testing a byte-for-byte copy of
 * the same source through this boundary bought a second, weaker suite rather
 * than more coverage. What this file DOES have to guarantee is that the copy is
 * faithful, which is what web/__tests__/lib/tutor.test.ts now asserts.
 *
 *  - TUTOR_ERROR_SENTINEL / OUT_OF_SCOPE_MESSAGE / MAX_QUESTION_CHARS cross the
 *    wire: the panel scans for the sentinel, renders the refusal in a different
 *    register, and caps its textarea at exactly the length the handler slices to.
 *  - stripGuideForTutor is exercised over the REAL curriculum GUIDEs by
 *    web/__tests__/content/tutor-corpus.test.ts, so the grounding-corruption
 *    invariants fail in the web CI job too.
 */
export {
  TUTOR_ERROR_SENTINEL,
  TUTOR_META_SENTINEL,
  OUT_OF_SCOPE_MESSAGE,
  MAX_QUESTION_CHARS,
  stripGuideForTutor,
} from "./tutor-core.generated";

/**
 * The model roster + labels, mirrored from lambda/tutor/tutor-billing.mjs by
 * the same generator. The picker MUST offer exactly what the server allows:
 * the handler re-checks entitlement and refuses in-band, so a drift here shows
 * up to the learner as a model that errors instead of answering.
 */
import { ROSTER, MODEL_LABELS } from "./tutor-billing.generated";

// Widened to an index signature at this boundary. The generated module is
// `@ts-nocheck`, so its literals infer as exact object shapes that a runtime
// `string` (the wallet's tier, the model id) cannot index. Declaring the
// lookup shape here keeps the widening in ONE place instead of scattering
// casts through every consumer.
export const TUTOR_ROSTER: Record<string, string[] | undefined> = ROSTER;
export const TUTOR_MODEL_LABELS: Record<string, string | undefined> = MODEL_LABELS;
