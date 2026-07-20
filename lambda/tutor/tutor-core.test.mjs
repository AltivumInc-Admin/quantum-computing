/**
 * Unit tests for tutor-core.mjs — the single source of truth for the tutor's
 * grounding/prompt logic (shared by index.mjs, the corpus builder, and the web
 * app via the generated copy). These cover the strip/heading/prompt/corpus-entry
 * functions directly; index.test.mjs covers the streaming handler on top of them.
 *
 * Run: `cd lambda/tutor && npm install && node --test` (CI runs this).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECTION_CHAR_CAP,
  MAX_QUESTION_CHARS,
  TUTOR_ERROR_SENTINEL,
  OUT_OF_SCOPE_MESSAGE,
  stripGuideForTutor,
  extractSectionHeadings,
  buildCorpusEntry,
  buildSystemPrompt,
} from "./tutor-core.mjs";

test("constants: sentinel is a delimited token; out-of-scope message is true inside a lesson", () => {
  assert.equal(TUTOR_ERROR_SENTINEL, "<<TUTOR-STREAM-ERROR>>");
  // The panel only renders inside /learn/<slug>, so the copy must not tell the
  // learner to open a lesson they are demonstrably already reading.
  assert.match(OUT_OF_SCOPE_MESSAGE, /don't have the text for this lesson/i);
  assert.doesNotMatch(OUT_OF_SCOPE_MESSAGE, /open a lesson/i);
});

test("constants: the caps are sized for the real curriculum, not a placeholder", () => {
  // 05-quantum-chemistry, the largest GUIDE, reduces to ~20.8k chars. A cap below
  // that silently discards grounding text the prompt then denies having.
  assert.ok(SECTION_CHAR_CAP >= 21_000, `SECTION_CHAR_CAP ${SECTION_CHAR_CAP} clips the largest lesson`);
  assert.equal(MAX_QUESTION_CHARS, 2000);
});

test("stripGuideForTutor: removes fenced blocks, math, inline code, links, and Markdown marks", () => {
  const md = [
    "# Title",
    "## Heading",
    "Some **bold** and _italic_ and `inline code` text.",
    "A [link label](https://example.com) and ![alt](img.png).",
    "Inline math $x^2$ and:",
    "$$E = mc^2$$",
    "```json",
    '{"widget": "should be dropped"}',
    "```",
    "> a blockquote",
  ].join("\n");
  const out = stripGuideForTutor(md);
  assert.ok(!out.includes("```"), "fenced blocks removed");
  assert.ok(!out.includes("widget"), "fenced block CONTENT removed");
  assert.ok(!out.includes("$$"), "block math delimiters removed");
  assert.ok(!out.includes("E = mc^2"), "block math content removed");
  assert.ok(out.includes("x^2"), "inline math unwrapped to its contents");
  assert.ok(out.includes("inline code"), "inline code unwrapped");
  assert.ok(!out.includes("`"), "backticks removed");
  assert.ok(out.includes("link label") && !out.includes("https://example.com"), "link -> label");
  assert.ok(out.includes("alt") && !out.includes("img.png"), "image -> alt label");
  assert.ok(!out.includes("**") && !out.includes("_italic_"), "emphasis marks removed");
  assert.ok(out.includes("bold") && out.includes("italic"), "emphasized words survive");
  assert.ok(out.includes("Heading") && !out.includes("## Heading"), "heading marks removed");
  assert.ok(!out.includes("> a blockquote") && out.includes("a blockquote"), "blockquote mark removed");
});

test("stripGuideForTutor: inline-code identifiers survive the emphasis pass intact", () => {
  // The prompt's strongest guardrail forbids the model from guessing Braket or
  // PennyLane method names. A blanket `[*_]{1,3}` delete used to run AFTER the
  // inline-code unwrap, so the corpus taught the model `circuit.statevector()`,
  // `AwsDevice.getdevices()` and `logmetric` — names that do not exist.
  const md =
    "Call `circuit.state_vector()` and `AwsDevice.get_devices()`, log with `log_metric`, " +
    "set `n_qubits` and `stopping_condition`, step via `optimizer.step_and_cost`. " +
    "Some **bold** and _italic_ text.";
  const out = stripGuideForTutor(md);
  for (const ident of [
    "circuit.state_vector()",
    "AwsDevice.get_devices()",
    "log_metric",
    "n_qubits",
    "stopping_condition",
    "optimizer.step_and_cost",
  ]) {
    assert.ok(out.includes(ident), `identifier mangled: ${ident} missing from ${JSON.stringify(out)}`);
  }
  // ...while the emphasis marks around real emphasis are still gone.
  assert.ok(!out.includes("**") && !out.includes("_italic_"), "emphasis marks removed");
  assert.ok(out.includes("bold") && out.includes("italic"), "emphasized words survive");
  assert.ok(!out.includes("`"), "backticks removed");
});

test("stripGuideForTutor: intra-word operators are not read as emphasis delimiters", () => {
  // Bare-prose math: `2*n` and `e^(-i*gamma*C)` have asterisks that pair up if the
  // emphasis rule ignores word boundaries, silently rewriting the expression.
  const out = stripGuideForTutor("The cost is 2*n gates and the phase is e^(-i*gamma*C) per layer.");
  assert.ok(out.includes("2*n"), `2*n mangled: ${out}`);
  assert.ok(out.includes("e^(-i*gamma*C)"), `exponent mangled: ${out}`);
});

test("stripGuideForTutor: prose currency keeps its dollar sign, math still unwraps", () => {
  // `$…$` is ambiguous with two prices on one line. The prompt orders the model to
  // never invent prices, so de-denominating them in the grounding text is worse
  // than leaving the delimiters in.
  const md =
    "QPUs charge per task ($0.30) plus per shot (e.g. $0.08 on IonQ).\n\n" +
    "1,000 shots is \\$0.30 + 1,000 x \\$0.08 = \\$80.30 per task.\n\n" +
    "The instance runs \\$0.10-\\$3.85/hour.\n\n" +
    "The amplitude is $\\alpha$, the probability $|\\alpha|^2$, the space $2^n$ and the gate $H$.";
  const out = stripGuideForTutor(md);
  for (const price of ["$0.30", "$0.08", "$80.30", "$0.10", "$3.85"]) {
    assert.ok(out.includes(price), `currency de-denominated: ${price} missing from ${JSON.stringify(out)}`);
  }
  assert.doesNotMatch(out, /\\\d/, "no stray backslash left where an escaped $ used to be");
  // Real inline math still loses its delimiters and keeps its contents.
  assert.ok(out.includes("|\\alpha|^2"), "inline math contents kept");
  assert.ok(out.includes("2^n"), "digit-leading math still unwrapped");
  assert.ok(!out.includes("$\\alpha$") && !out.includes("$H$"), "math delimiters removed");
});

test("stripGuideForTutor: truncates on a paragraph boundary within the cap, never mid-sentence", () => {
  const head = "A".repeat(50);
  const tail = "B".repeat(50);
  // One paragraph break well past the half-cap point; everything after it must be dropped.
  const md = `${head}\n\n${"x".repeat(30)}\n\n${tail}`;
  const cap = 90; // break at index 52 (> cap/2=45) is the last break within the window
  const out = stripGuideForTutor(md, cap);
  assert.ok(out.length <= cap);
  assert.ok(out.startsWith(head), "keeps the head paragraph");
  assert.ok(!out.includes("B"), "drops everything after the last in-window paragraph break");
  assert.ok(!out.endsWith("\n"), "trimmed");
});

test("stripGuideForTutor: falls back to the hard cap when the only break is in the first half", () => {
  // Break at index 5 (< cap/2), then a long unbroken run -> must hard-cut at cap, not at index 5.
  const md = `${"A".repeat(5)}\n\n${"B".repeat(200)}`;
  const cap = 100;
  const out = stripGuideForTutor(md, cap);
  assert.equal(out.length, cap, "hard cap applied, not cut back to the early break");
});

test("extractSectionHeadings: returns H2/H3 in order, ignoring H1 and H4+", () => {
  const md = ["# H1 title", "## First", "text", "### Sub", "#### TooDeep", "## Second"].join("\n");
  assert.deepEqual(extractSectionHeadings(md), ["First", "Sub", "Second"]);
});

test("buildSystemPrompt: embeds title, headings, the guardrail clauses, and the grounding text", () => {
  const section = { title: "Quantum Chemistry", headings: ["VQE", "UCCSD"], text: "the lesson body here" };
  const p = buildSystemPrompt(section);
  assert.ok(p.includes('titled "Quantum Chemistry"'), "title embedded");
  assert.ok(p.includes("VQE; UCCSD"), "headings listed");
  assert.ok(/Answer ONLY using the lesson text/i.test(p), "grounding guardrail present");
  assert.ok(/NEVER invent or guess Amazon Braket, PennyLane, or Qiskit/i.test(p), "no-invention guardrail present");
  assert.ok(/ONE short guiding question/i.test(p), "Socratic guardrail present");
  // The panel renders the stream into a plain <p>, so any Markdown or LaTeX the
  // model emits reaches the learner as literal marker characters.
  assert.ok(/plain prose/i.test(p), "plain-prose output rule present");
  assert.ok(/no markdown formatting/i.test(p), "Markdown explicitly forbidden");
  // Mirrored from the web suite so the guardrail survives if that copy is retired.
  assert.ok(/do not use emojis/i.test(p), "no-emoji rule present");
  assert.ok(p.includes("LESSON TEXT:"), "lesson-text label present");
  // The whole point of grounding — the section's own text must reach the model.
  assert.ok(p.includes("the lesson body here"), "grounding text included");
});

test("buildSystemPrompt: omits the headings clause when there are none", () => {
  const p = buildSystemPrompt({ title: "T", headings: [], text: "body" });
  assert.ok(!p.includes("The lesson covers these sections"), "no headings clause when headings is empty");
});

test("buildCorpusEntry: title from H1, headings filtered to surviving text, not truncated for short input", () => {
  const md = ["# My Lesson", "## Alpha", "alpha body", "## Beta", "beta body"].join("\n");
  const { entry, truncated, droppedHeadings } = buildCorpusEntry(md, { fallbackTitle: "00-x" });
  assert.equal(entry.title, "My Lesson");
  assert.deepEqual(entry.headings, ["Alpha", "Beta"]);
  assert.ok(entry.text.includes("alpha body") && entry.text.includes("beta body"));
  assert.equal(truncated, false);
  assert.equal(droppedHeadings, 0);
});

test("buildCorpusEntry: falls back to fallbackTitle when there is no H1", () => {
  const { entry } = buildCorpusEntry("## Only an H2\nbody", { fallbackTitle: "03-fallback" });
  assert.equal(entry.title, "03-fallback");
});

test("buildCorpusEntry: drops headings whose content was truncated away (no false grounding claim)", () => {
  // buildCorpusEntry always strips at the production SECTION_CHAR_CAP (there is no
  // cap parameter), so truncation is forced by making the input exceed the real
  // cap — which asserts the invariant against the cap that actually ships.
  const big = "# T\n## Kept\n" + "word ".repeat(SECTION_CHAR_CAP) + "\n## Dropped\ntail";
  const { entry, truncated, droppedHeadings } = buildCorpusEntry(big);
  assert.equal(truncated, true);
  assert.ok(entry.headings.includes("Kept"));
  assert.ok(!entry.headings.includes("Dropped"), "a heading past the cap is not advertised");
  assert.ok(droppedHeadings >= 1);

  // Sanity: a short input is not accidentally reported as truncated.
  const small = buildCorpusEntry(["# T", "## Kept", "K".repeat(60), "## Dropped", "D".repeat(60)].join("\n"));
  assert.equal(small.truncated, false);
});
