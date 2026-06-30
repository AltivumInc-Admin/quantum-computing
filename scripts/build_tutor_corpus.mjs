#!/usr/bin/env node
/**
 * Build the grounding corpus for the "Ask the margin" lesson tutor. Reads every
 * curriculum GUIDE.md, reduces it to plain grounding prose, and writes
 * lambda/tutor/corpus.json keyed by section slug (slug === on-disk dir name).
 *
 * The strip/heading logic is imported from lambda/tutor/tutor-core.mjs (the
 * single source of truth, shared with the Lambda). Run via
 * `npm --prefix web run build:tutor-corpus` or `node scripts/build_tutor_corpus.mjs`
 * before packaging the Lambda.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpusEntry } from "../lambda/tutor/tutor-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "lambda", "tutor", "corpus.json");

const dirs = fs
  .readdirSync(ROOT)
  .filter((d) => /^\d\d-/.test(d) && fs.existsSync(path.join(ROOT, d, "GUIDE.md")))
  .sort();

const corpus = {};
let truncatedCount = 0;
for (const dir of dirs) {
  const md = fs.readFileSync(path.join(ROOT, dir, "GUIDE.md"), "utf8");
  const { entry, fullLength, truncated, droppedHeadings } = buildCorpusEntry(md, {
    fallbackTitle: dir,
  });
  if (truncated) {
    truncatedCount++;
    console.warn(
      `[tutor-corpus] WARN: ${dir} truncated ${fullLength} -> ${entry.text.length} chars; ` +
        `${droppedHeadings} trailing heading(s) dropped`
    );
  }
  corpus[dir] = entry;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(corpus));
console.log(
  `Wrote ${Object.keys(corpus).length} sections (${dirs.join(", ")}) -> ${OUT}` +
    (truncatedCount ? ` (${truncatedCount} truncated)` : "")
);
