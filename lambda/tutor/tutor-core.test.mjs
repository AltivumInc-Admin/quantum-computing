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
  TUTOR_ERROR_SENTINEL,
  OUT_OF_SCOPE_MESSAGE,
  stripGuideForTutor,
  extractSectionHeadings,
  buildCorpusEntry,
  buildSystemPrompt,
} from "./tutor-core.mjs";

test("constants: sentinel is a delimited token; out-of-scope message points back to lessons", () => {
  assert.equal(TUTOR_ERROR_SENTINEL, "<<TUTOR-STREAM-ERROR>>");
  assert.match(OUT_OF_SCOPE_MESSAGE, /only help with the lessons/i);
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
  // Force truncation: a long first section, then a trailing heading whose body falls past the cap.
  const md = ["# T", "## Kept", "K".repeat(60), "## Dropped", "D".repeat(60)].join("\n");
  // tutor-core's SECTION_CHAR_CAP is large; pass a small cap via stripGuideForTutor is internal,
  // so instead assert the invariant on the real cap by making the input exceed it.
  void SECTION_CHAR_CAP;
  const big = "# T\n## Kept\n" + "word ".repeat(SECTION_CHAR_CAP) + "\n## Dropped\ntail";
  const { entry, truncated, droppedHeadings } = buildCorpusEntry(big);
  assert.equal(truncated, true);
  assert.ok(entry.headings.includes("Kept"));
  assert.ok(!entry.headings.includes("Dropped"), "a heading past the cap is not advertised");
  assert.ok(droppedHeadings >= 1);
  // sanity: the small-input case isn't accidentally truncated
  const small = buildCorpusEntry(md);
  assert.equal(small.truncated, false);
});
