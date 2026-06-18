/**
 * Canonical, tested logic for the "Ask the margin" lesson tutor. This module is
 * the single source of truth for (a) reducing a GUIDE to grounding text and
 * (b) building the strict, Socratic, curriculum-only system prompt. The Lambda
 * (lambda/tutor/index.mjs) and the corpus builder (scripts/build_tutor_corpus.mjs)
 * MIRROR these functions in plain ESM for their runtimes — the same
 * tested-canonical + runtime-mirror pattern this repo uses for cost.ts <-> cost.py.
 * Keep the three in sync; the tests here pin the behavior that matters.
 */

/** Per-section grounding text is capped so the prompt stays bounded. */
export const SECTION_CHAR_CAP = 12_000;

/**
 * In-band failure marker the streaming endpoint writes when it errors. The
 * response is already committed as HTTP 200 (streaming starts before the model
 * call), so the status can't signal failure — the client scans for this sentinel
 * to enter its error state instead of rendering the apology as the answer. The
 * exact delimited token never occurs in tutor prose. MIRRORED in
 * lambda/tutor/index.mjs.
 */
export const TUTOR_ERROR_SENTINEL = "<<TUTOR-STREAM-ERROR>>";

/** What the endpoint streams back when asked about a section it has no text for. */
export const OUT_OF_SCOPE_MESSAGE =
  "I can only help with the lessons in this curriculum. Open a lesson and ask me about it there.";

export interface TutorSection {
  title: string;
  headings: string[];
  text: string;
}

/**
 * Reduce a GUIDE's Markdown to plain grounding prose: drop fenced blocks (widget
 * JSON and code — both noise for conceptual Q&A), unwrap inline code, strip math
 * delimiters, links, and Markdown marks, then collapse whitespace and cap length.
 * When over the cap, truncate on a paragraph boundary so a lesson is never cut
 * mid-sentence.
 */
export function stripGuideForTutor(markdown: string, cap: number = SECTION_CHAR_CAP): string {
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
export function extractSectionHeadings(markdown: string): string[] {
  const out: string[] = [];
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
export function buildSystemPrompt(section: TutorSection): string {
  const headings = section.headings.length
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
