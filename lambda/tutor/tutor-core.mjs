/**
 * THE single source of truth for the "Ask the margin" lesson tutor's grounding
 * and prompt logic: reduce a GUIDE to grounding text, extract its headings, and
 * build the strict Socratic, curriculum-only system prompt.
 *
 * Dependency-free ESM. It lives under lambda/tutor/ specifically so `sam build`
 * (default Node builder, CodeUri: ./) bundles it into the deploy artifact.
 * Three consumers import it directly and natively (all plain Node ESM):
 *   - lambda/tutor/index.mjs           via "./tutor-core.mjs"
 *   - lambda/tutor/deploy-check.mjs    via "./tutor-core.mjs"      (freshness gate)
 *   - scripts/build_tutor_corpus.mjs   via "../lambda/tutor/tutor-core.mjs"
 * The web app does NOT import this .mjs at runtime — ts-jest's transform only
 * matches .tsx?, so a direct cross-boundary .mjs import breaks the Jest suite.
 * Instead a prebuild step (web `gen:tutor-core`) copies this file into the
 * gitignored web/src/lib/tutor-core.generated.ts, which web/src/lib/tutor.ts
 * re-exports. There is no manual "keep in sync" — this is the only copy.
 */

/**
 * Per-section grounding text is capped so the prompt stays bounded.
 *
 * Sized to clear the whole curriculum with headroom: the largest GUIDE
 * (05-quantum-chemistry) reduces to ~20.8k chars, so 24k keeps every lesson
 * whole. It was 12k, which silently discarded 20% of the corpus — including 43%
 * of the chemistry lesson and 26 of its headings across all seven sections — and
 * because the prompt orders the model to answer ONLY from the text below, a
 * learner asking about a truncated back half was told it is outside the lesson.
 * The truncate-on-paragraph-boundary cut and the heading filter below stay as
 * the backstop for a future runaway GUIDE, and the corpus build now fails loudly
 * rather than warning past it (see scripts/build_tutor_corpus.mjs).
 */
export const SECTION_CHAR_CAP = 24_000;

/**
 * In-band failure marker the streaming endpoint writes when it errors. The
 * response is already committed as HTTP 200 (streaming starts before the model
 * call), so the status can't signal failure — the client scans for this sentinel
 * to enter its error state instead of rendering the apology as the answer. The
 * exact delimited token never occurs in tutor prose.
 */
export const TUTOR_ERROR_SENTINEL = "<<TUTOR-STREAM-ERROR>>";

/**
 * Longest question the handler will accept. Single-sourced here because both
 * runtimes need it: the handler slices to it, and the panel's textarea caps at it
 * so a long paste is stopped at the keyboard rather than silently amputated
 * server-side. It also keeps any question well under the handler's 16 KiB body
 * limit, whose overflow path is indistinguishable from an unknown lesson.
 */
export const MAX_QUESTION_CHARS = 2000;

/**
 * What the endpoint streams back when it has no text for the requested section.
 *
 * Worded to be true wherever it can actually be read. The panel only renders
 * inside /learn/<slug>, so the old "Open a lesson and ask me about it there" told
 * a learner to go somewhere they already were; and the realistic trigger is not a
 * bad slug but a corpus that failed to load, which makes every lesson answer this.
 */
export const OUT_OF_SCOPE_MESSAGE =
  "I don't have the text for this lesson loaded, so I can't answer from it yet. Try another lesson, or come back shortly.";

/**
 * Sentinels for spans that must survive the Markdown passes byte-for-byte. NUL
 * never appears in curriculum Markdown, so a parked span can never be confused
 * with prose, and neither sentinel contains a character any pass below matches.
 */
const CODE_SENTINEL = (i) => `\u0000c${i}\u0000`;
const CODE_SENTINEL_RE = /\u0000c(\d+)\u0000/g;
const DOLLAR_SENTINEL = "\u0000d\u0000";
const DOLLAR_SENTINEL_RE = /\u0000d\u0000/g;

/**
 * True when a `$…$` span is really inline math rather than two prose currency
 * figures that happen to sit on one line. `$…$` is ambiguous in a curriculum
 * that prices QPU shots in dollars: a blind unwrap turns
 * "$0.30) plus per shot (e.g. $0.08 on IonQ)" into "0.30) plus … 0.08", stripping
 * the denomination from the exact numbers the prompt forbids the model to invent.
 * Math is anything carrying a LaTeX signal, or not opening on a digit, or with no
 * inner whitespace — which keeps `$2^n$`, `$H$`, `$-1.137$` and `$0.74$` unwrapping
 * while leaving a run of prose between two prices alone.
 */
function isInlineMath(body) {
  return /[\\^_{}]/.test(body) || !/^[\d.,]/.test(body) || !/\s/.test(body);
}

/**
 * Reduce a GUIDE's Markdown to plain grounding prose: drop fenced blocks (widget
 * JSON and code — both noise for conceptual Q&A), unwrap inline code, strip math
 * delimiters, links, and Markdown marks, then collapse whitespace and cap length.
 * When over the cap, truncate on a paragraph boundary so a lesson is never cut
 * mid-sentence.
 *
 * Order matters: inline code and escaped currency are parked behind sentinels
 * before any mark-stripping pass runs, and restored only once they are all done.
 * The prompt's strongest guardrail forbids the model from guessing Braket or
 * PennyLane method names, so an identifier that reaches it corrupted is worse
 * than one that never reaches it at all.
 */
export function stripGuideForTutor(markdown, cap = SECTION_CHAR_CAP) {
  let t = markdown;
  t = t.replace(/```[\s\S]*?```/g, " "); // fenced blocks (widgets + code)
  t = t.replace(/\$\$[\s\S]*?\$\$/g, " "); // block math

  // Park inline code FIRST. Its contents are API names — `n_qubits`,
  // `circuit.state_vector()`, `optimizer.step_and_cost` — and every underscore,
  // asterisk and dollar inside one has to reach the model exactly as the API
  // spells it. Unwrapping code to bare prose before the emphasis pass is what
  // used to produce `circuit.statevector()` and `logmetric`.
  const code = [];
  t = t.replace(/`([^`]+)`/g, (_m, inner) => CODE_SENTINEL(code.push(inner) - 1));
  // Park escaped currency (`\$0.30`) so the inline-math pass cannot pair it and
  // so the backslash never survives into the text as a stray `\0.30`.
  t = t.replace(/\\\$/g, DOLLAR_SENTINEL);

  t = t.replace(/\$([^$\n]+)\$/g, (m, body) => (isInlineMath(body) ? body : m)); // inline math -> contents
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"); // links / images -> label
  t = t.replace(/^#{1,6}\s+/gm, ""); // heading marks
  t = t.replace(/^>\s?/gm, ""); // blockquote marks
  // Emphasis: unwrap PAIRED delimiters that sit on a word boundary, the way a
  // Markdown renderer reads them. A blanket `[*_]{1,3}` character delete instead
  // eats every operator and identifier separator in the prose — `2*n` became
  // `2n`, `e^(-i*gamma*C)` became `e^(-igammaC)` and `state_vector` became
  // `statevector`. The boundary guards are what keep an intra-word mark
  // (a multiplication sign, a snake_case name) from being read as a delimiter.
  t = t.replace(/(?<!\w)\*\*\*([^*]+)\*\*\*(?!\w)/g, "$1");
  t = t.replace(/(?<!\w)\*\*([^*]+)\*\*(?!\w)/g, "$1");
  t = t.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1");
  t = t.replace(/(?<!\w)(_{1,3})([^_\n]+)\1(?!\w)/g, "$2");

  // Restore the parked spans now that every mark-stripping pass has run. Both
  // use replacer functions so a `$` inside an identifier is never read as a
  // replacement pattern.
  t = t.replace(DOLLAR_SENTINEL_RE, () => "$");
  t = t.replace(CODE_SENTINEL_RE, (_m, i) => code[Number(i)]);

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
 * Build one corpus entry from a GUIDE's Markdown — the per-section logic shared by
 * the corpus builder (`scripts/build_tutor_corpus.mjs`) and the deploy preflight
 * (`lambda/tutor/deploy-check.mjs`), so a freshness check rebuilds with the exact
 * same logic that wrote the file. Title is the first H1, falling back to
 * ``fallbackTitle``. Only headings whose text survived truncation are advertised,
 * so the grounding prompt never claims to cover a section it has no text for.
 *
 * Returns ``{ entry: {title, headings, text}, fullLength, truncated, droppedHeadings }``.
 */
export function buildCorpusEntry(markdown, { fallbackTitle = "" } = {}) {
  const title = (markdown.match(/^#\s+(.+)$/m)?.[1] ?? fallbackTitle).trim();
  const text = stripGuideForTutor(markdown);
  const fullLength = stripGuideForTutor(markdown, Infinity).length;
  const allHeadings = extractSectionHeadings(markdown);
  const headings = allHeadings.filter((h) => text.includes(h));
  return {
    entry: { title, headings, text },
    fullLength,
    truncated: fullLength > text.length,
    droppedHeadings: allHeadings.length - headings.length,
  };
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
    `- Reply in plain prose. No Markdown formatting (no asterisks, hashes, backticks or bullet markers) and no LaTeX delimiters — your answer is rendered as plain text, so any marker character is read literally by the learner.`,
    ``,
    `LESSON TEXT:`,
    section.text,
  ].join("\n");
}
