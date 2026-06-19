/**
 * THE single source of truth for the "Ask the margin" lesson tutor's grounding
 * and prompt logic: reduce a GUIDE to grounding text, extract its headings, and
 * build the strict Socratic, curriculum-only system prompt.
 *
 * Dependency-free ESM. It lives under lambda/tutor/ specifically so `sam build`
 * (default Node builder, CodeUri: ./) bundles it into the deploy artifact.
 * Two consumers import it directly and natively (both are plain Node ESM):
 *   - lambda/tutor/index.mjs           via "./tutor-core.mjs"
 *   - scripts/build_tutor_corpus.mjs   via "../lambda/tutor/tutor-core.mjs"
 * The web app does NOT import this .mjs at runtime — ts-jest's transform only
 * matches .tsx?, so a direct cross-boundary .mjs import breaks the Jest suite.
 * Instead a prebuild step (web `gen:tutor-core`) copies this file into the
 * gitignored web/src/lib/tutor-core.generated.ts, which web/src/lib/tutor.ts
 * re-exports. There is no manual "keep in sync" — this is the only copy.
 */

/** Per-section grounding text is capped so the prompt stays bounded. */
export const SECTION_CHAR_CAP = 12_000;

/**
 * In-band failure marker the streaming endpoint writes when it errors. The
 * response is already committed as HTTP 200 (streaming starts before the model
 * call), so the status can't signal failure — the client scans for this sentinel
 * to enter its error state instead of rendering the apology as the answer. The
 * exact delimited token never occurs in tutor prose.
 */
export const TUTOR_ERROR_SENTINEL = "<<TUTOR-STREAM-ERROR>>";

/** What the endpoint streams back when asked about a section it has no text for. */
export const OUT_OF_SCOPE_MESSAGE =
  "I can only help with the lessons in this curriculum. Open a lesson and ask me about it there.";

/**
 * Reduce a GUIDE's Markdown to plain grounding prose: drop fenced blocks (widget
 * JSON and code — both noise for conceptual Q&A), unwrap inline code, strip math
 * delimiters, links, and Markdown marks, then collapse whitespace and cap length.
 * When over the cap, truncate on a paragraph boundary so a lesson is never cut
 * mid-sentence.
 */
export function stripGuideForTutor(markdown, cap = SECTION_CHAR_CAP) {
  let t = markdown;
  t = t.replace(/```[\s\S]*?```/g, " "); // fenced blocks (widgets + code)
  t = t.replace(/\$\$[\s\S]*?\$\$/g, " "); // block math
  t = t.replace(/\$([^$\n]+)\$/g, "$1"); // inline math -> contents
  t = t.replace(/`([^`]+)`/g, "$1"); // inline code -> text
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"); // links / images -> label
  t = t.replace(/^#{1,6}\s+/gm, ""); // heading marks
  t = t.replace(/^>\s?/gm, ""); // blockquote marks
  t = t.replace(/[*_]{1,3}/g, ""); // emphasis marks
  t = t.replace(/\n{3,}/g, "\n\n").trim(); // collapse blank lines
  if (t.length <= cap) return t;
  // Cut on the last paragraph break within the window so the text ends on a
  // section boundary rather than mid-sentence; fall back to the hard cap if the
  // only break is in the first half.
  const slice = t.slice(0, cap);
  const lastBreak = slice.lastIndexOf("\n\n");
  return (lastBreak > cap / 2 ? slice.slice(0, lastBreak) : slice).trimEnd();
}

/** Section H2/H3 headings, in order — used for "grounded in" citations. */
export function extractSectionHeadings(markdown) {
  const out = [];
  for (const line of markdown.split("\n")) {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[2].trim());
  }
  return out;
}

/**
 * The strict system prompt. The guardrail clauses are the whole point of the
 * feature, so the tests assert their presence: answer only from this lesson,
 * never invent Braket/PennyLane/Qiskit APIs, and prefer a guiding question first.
 */
export function buildSystemPrompt(section) {
  const headings = section.headings?.length
    ? `\nThe lesson covers these sections: ${section.headings.join("; ")}.`
    : "";
  return [
    `You are a tutor embedded in a single lesson of an Amazon Braket quantum-computing curriculum.`,
    `The lesson is titled "${section.title}".${headings}`,
    ``,
    `RULES:`,
    `- Answer ONLY using the lesson text provided below. If the question is outside this lesson, say so plainly and point the learner back to the relevant part of the curriculum.`,
    `- NEVER invent or guess Amazon Braket, PennyLane, or Qiskit APIs, method names, parameters, prices, or numbers. If you are not certain from the lesson text, say you are not sure.`,
    `- Prefer asking ONE short guiding question before giving the full answer (Socratic tutoring), then answer if the learner is still stuck.`,
    `- Be concise and concrete. Use the lesson's own notation. Do not use emojis.`,
    ``,
    `LESSON TEXT:`,
    section.text,
  ].join("\n");
}
