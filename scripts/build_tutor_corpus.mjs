#!/usr/bin/env node
/**
 * Build the grounding corpus for the "Ask the margin" lesson tutor. Reads every
 * curriculum GUIDE.md, reduces it to plain grounding prose, and writes
 * lambda/tutor/corpus.json keyed by section slug (slug === on-disk dir name).
 *
 * The strip/heading logic is imported from lambda/tutor/tutor-core.mjs (the
 * single source of truth, shared with the Lambda). Run via
 * `npm --prefix lambda/tutor run build:corpus` or `node scripts/build_tutor_corpus.mjs`
 * before packaging the Lambda.
 *
 * A HAND-TYPED DEPLOY *CAN* SKIP THIS, and once did. npm only fires `predeploy`
 * for `npm run deploy`; a bare `sam build && sam deploy` runs neither, and the
 * 2026-08-29 QL-Prod deploy shipped a corpus built before 2026-08-19 for exactly
 * that reason — including a sponsored-QPU promise the curriculum had already
 * withdrawn. Three guards now exist because the npm hook alone is not one:
 *   - lambda/tutor/corpus-freshness.test.mjs — offline, runs under `npm test`
 *   - .github/workflows/tutor-corpus.yml — rebuilds + preflights on every push
 *   - lambda/tutor `npm run deploy` chains the gate INSIDE the deploy script,
 *     not only in the predeploy hook, so `--ignore-scripts` cannot strip it.
 *
 * TRUNCATION IS A BUILD FAILURE. A section that exceeds SECTION_CHAR_CAP is cut,
 * and because the system prompt orders the model to answer ONLY from the text it
 * is given, the cut half becomes a confident "that's outside this lesson" refusal
 * for the learner. That used to be a WARN line that scrolled past — all seven
 * sections were being truncated in production with nobody noticing. Now it exits
 * non-zero so the choice is explicit: raise the cap, or set
 * ALLOW_TUTOR_TRUNCATION=1 to ship a knowingly-clipped corpus.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpusEntry, SECTION_CHAR_CAP } from "../lambda/tutor/tutor-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// TUTOR_CORPUS_OUT redirects the write so a freshness test can rebuild into a
// temp dir and diff the result against the checked-out artifact WITHOUT
// clobbering it (a test that overwrote corpus.json would repair the very
// staleness it is supposed to detect). Unset — the normal path — it writes the
// one location the Lambda package reads.
const OUT = process.env.TUTOR_CORPUS_OUT
  ? path.resolve(process.env.TUTOR_CORPUS_OUT)
  : path.join(ROOT, "lambda", "tutor", "corpus.json");

const dirs = fs
  .readdirSync(ROOT)
  .filter((d) => /^\d\d-/.test(d) && fs.existsSync(path.join(ROOT, d, "GUIDE.md")))
  .sort();

const corpus = {};
const truncations = [];
for (const dir of dirs) {
  const md = fs.readFileSync(path.join(ROOT, dir, "GUIDE.md"), "utf8");
  const { entry, fullLength, truncated, droppedHeadings } = buildCorpusEntry(md, {
    fallbackTitle: dir,
  });
  if (truncated) {
    truncations.push(
      `${dir}: ${fullLength} -> ${entry.text.length} chars ` +
        `(${fullLength - entry.text.length} discarded, ${droppedHeadings} heading(s) dropped)`
    );
  }
  corpus[dir] = entry;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(corpus));
console.log(`Wrote ${Object.keys(corpus).length} sections (${dirs.join(", ")}) -> ${OUT}`);

if (truncations.length) {
  const allowed = process.env.ALLOW_TUTOR_TRUNCATION === "1";
  const level = allowed ? "WARN" : "ERROR";
  console.error(
    `\n[tutor-corpus] ${level}: ${truncations.length} of ${dirs.length} section(s) exceeded ` +
      `SECTION_CHAR_CAP (${SECTION_CHAR_CAP}) and were cut:`
  );
  for (const t of truncations) console.error(`  - ${t}`);
  console.error(
    `\nThe tutor answers ONLY from this text, so a learner asking about a cut section is\n` +
      `told it is outside the lesson. Raise SECTION_CHAR_CAP in lambda/tutor/tutor-core.mjs,\n` +
      `or re-run with ALLOW_TUTOR_TRUNCATION=1 to ship a knowingly-clipped corpus.`
  );
  if (!allowed) process.exit(1);
}
