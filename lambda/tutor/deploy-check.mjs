#!/usr/bin/env node
/**
 * Pre-deploy preflight gate for the "Ask the margin" tutor Lambda. Run it AFTER
 * building the corpus and BEFORE `sam deploy`:
 *
 *   npm --prefix web run build:tutor-corpus
 *   TUTOR_MODEL_ID=<inference-profile-arn> node lambda/tutor/deploy-check.mjs
 *   # or: node lambda/tutor/deploy-check.mjs <inference-profile-arn>
 *
 * It fails (exit 1) if either guard trips, so a broken deploy is caught before it
 * ships:
 *   1. CORPUS FRESHNESS — `lambda/tutor/corpus.json` (gitignored, built at deploy)
 *      must exist and, for every `NN-*` curriculum section's `GUIDE.md`, contain a
 *      non-empty entry that matches a fresh rebuild. Catches "forgot to rebuild
 *      after editing/adding a GUIDE" and the silent empty-corpus-answers-everything
 *      OUT_OF_SCOPE failure mode.
 *   2. MODEL ID — must be present and shaped like a Bedrock inference-profile ARN
 *      (system or application) or a foundation-model id/ARN. A format/presence
 *      check only — no AWS call — so it runs in CI and offline. Confirm the profile
 *      actually exists with `aws bedrock list-inference-profiles` before deploying.
 *
 * Pure helpers are exported and unit-tested in deploy-check.test.mjs (CI runs it via
 * `node --test`). Not in package.json `files`, so `sam build` never packages it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCorpusEntry } from "./tutor-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const CORPUS_PATH = path.join(HERE, "corpus.json");

/**
 * True if `id` is a Bedrock model identifier the handler can pass to ConverseStream:
 * a system/application inference-profile ARN, a foundation-model ARN, or a bare
 * foundation-model / cross-region inference-profile id (e.g.
 * `anthropic.claude-haiku-4-5-20251001-v1:0`, `us.anthropic.claude-...-v1:0`).
 */
export function isValidBedrockModelId(id) {
  if (typeof id !== "string") return false;
  const s = id.trim();
  if (s === "") return false;
  // (application-)inference-profile ARN
  if (/^arn:aws[a-z-]*:bedrock:[a-z0-9-]+:\d+:(application-)?inference-profile\/\S+$/.test(s)) {
    return true;
  }
  // foundation-model ARN (account field is empty for AWS-owned models)
  if (/^arn:aws[a-z-]*:bedrock:[a-z0-9-]+::foundation-model\/\S+$/.test(s)) return true;
  // bare foundation-model or cross-region inference-profile id, ending in a `:N` version
  if (/^([a-z]{2}\.)?[a-z0-9][a-z0-9.-]*:\d+$/.test(s)) return true;
  return false;
}

/** The curriculum's `NN-*` sections that have a GUIDE.md — the corpus's source set. */
export function listGuideSections(root = REPO_ROOT) {
  return fs
    .readdirSync(root)
    .filter((d) => /^\d\d-/.test(d) && fs.existsSync(path.join(root, d, "GUIDE.md")))
    .sort();
}

/**
 * Compare an in-memory `corpus` object to a fresh rebuild of every `section`'s
 * GUIDE.md. Returns a list of human-readable problems (empty list ⇒ fresh and
 * complete). Pure except for reading the GUIDE.md files under `root`.
 */
export function corpusFreshnessProblems(corpus, sections, root = REPO_ROOT) {
  const problems = [];
  const expected = new Set(sections);
  for (const slug of Object.keys(corpus)) {
    if (!expected.has(slug)) {
      problems.push(`stale: corpus has "${slug}" but there is no ${slug}/GUIDE.md (rebuild)`);
    }
  }
  for (const slug of sections) {
    const have = Object.prototype.hasOwnProperty.call(corpus, slug) ? corpus[slug] : undefined;
    if (!have) {
      problems.push(`missing: no corpus entry for "${slug}" (run build:tutor-corpus)`);
      continue;
    }
    if (!have.text || !have.text.trim()) {
      problems.push(`empty: corpus entry "${slug}" has no grounding text`);
      continue;
    }
    const md = fs.readFileSync(path.join(root, slug, "GUIDE.md"), "utf8");
    const { entry } = buildCorpusEntry(md, { fallbackTitle: slug });
    if (JSON.stringify(entry) !== JSON.stringify(have)) {
      problems.push(`stale: corpus entry "${slug}" differs from a fresh build of its GUIDE.md (rebuild)`);
    }
  }
  return problems;
}

export function runPreflight({ modelId, corpusPath = CORPUS_PATH, root = REPO_ROOT } = {}) {
  const errors = [];

  if (!isValidBedrockModelId(modelId)) {
    errors.push(
      `model id invalid/missing: ${JSON.stringify(modelId)} — pass the inference-profile ARN as ` +
        `$TUTOR_MODEL_ID or arg 1 (find it: aws bedrock list-inference-profiles)`
    );
  }

  let corpus = null;
  try {
    corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  } catch (err) {
    errors.push(`cannot read ${corpusPath}: ${err.message} — run: npm --prefix web run build:tutor-corpus`);
  }
  if (corpus) {
    for (const p of corpusFreshnessProblems(corpus, listGuideSections(root), root)) errors.push(p);
  }
  return errors;
}

function main(argv) {
  const modelId = process.env.TUTOR_MODEL_ID || argv[2] || "";
  const errors = runPreflight({ modelId });
  if (errors.length) {
    console.error("tutor deploy preflight FAILED:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("tutor deploy preflight OK — corpus is fresh and the model id is well-formed.");
}

// Only run the CLI when executed directly, so importing the helpers in tests is side-effect-free.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv);
}
