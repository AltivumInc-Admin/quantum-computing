/**
 * Public API for the "Ask the margin" lesson tutor's grounding/prompt logic.
 *
 * The implementation is single-sourced in lambda/tutor/tutor-core.mjs (so the
 * Lambda and the corpus builder import the exact same code). A prebuild step
 * (web `gen:tutor-core`, run by the pretest/prebuild hooks) copies that module
 * into the gitignored ./tutor-core.generated.ts, which this file re-exports.
 * There is no manual "keep in sync" — this module just re-exports the one copy,
 * and the tests here (web/__tests__/lib/tutor.test.ts) still pin the behavior.
 */
export {
  SECTION_CHAR_CAP,
  TUTOR_ERROR_SENTINEL,
  OUT_OF_SCOPE_MESSAGE,
  stripGuideForTutor,
  extractSectionHeadings,
  buildSystemPrompt,
} from "./tutor-core.generated";

export interface TutorSection {
  title: string;
  headings: string[];
  text: string;
}
