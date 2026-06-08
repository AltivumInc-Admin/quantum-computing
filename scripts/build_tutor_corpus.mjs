#!/usr/bin/env node
/**
 * Build the grounding corpus for the "Ask the margin" lesson tutor. Reads every
 * curriculum GUIDE.md, reduces it to plain grounding prose, and writes
 * lambda/tutor/corpus.json keyed by section slug (slug === on-disk dir name).
 *
 * The strip/heading logic MIRRORS web/src/lib/tutor.ts (the tested canonical).
 * Keep the two in sync. Run via `npm --prefix web run build:tutor-corpus` or
 * `node scripts/build_tutor_corpus.mjs` before packaging the Lambda.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "lambda", "tutor", "corpus.json");
const SECTION_CHAR_CAP = 12_000;

// --- mirror of web/src/lib/tutor.ts ---------------------------------------
function stripGuideForTutor(markdown, cap = SECTION_CHAR_CAP) {
  let t = markdown;
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/\$\$[\s\S]*?\$\$/g, " ");
  t = t.replace(/\$([^$\n]+)\$/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^>\s?/gm, "");
  t = t.replace(/[*_]{1,3}/g, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t.length > cap ? t.slice(0, cap).trimEnd() : t;
}

function extractSectionHeadings(markdown) {
  const out = [];
  for (const line of markdown.split("\n")) {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[2].trim());
  }
  return out;
}
// --------------------------------------------------------------------------

const dirs = fs
  .readdirSync(ROOT)
  .filter((d) => /^\d\d-/.test(d) && fs.existsSync(path.join(ROOT, d, "GUIDE.md")))
  .sort();

const corpus = {};
for (const dir of dirs) {
  const md = fs.readFileSync(path.join(ROOT, dir, "GUIDE.md"), "utf8");
  const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? dir).trim();
  corpus[dir] = {
    title,
    headings: extractSectionHeadings(md),
    text: stripGuideForTutor(md),
  };
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(corpus));
console.log(`Wrote ${Object.keys(corpus).length} sections (${dirs.join(", ")}) -> ${OUT}`);
