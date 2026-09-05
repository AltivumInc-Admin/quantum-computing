#!/usr/bin/env node
/**
 * Pre-deploy preflight gate for the "Ask the margin" tutor Lambda. Run it AFTER
 * building the corpus and BEFORE `sam deploy`:
 *
 *   npm --prefix lambda/tutor run build:corpus
 *   node lambda/tutor/deploy-check.mjs
 *
 * It fails (exit 1) if either guard trips, so a broken deploy is caught before it
 * ships:
 *   1. CORPUS FRESHNESS — `lambda/tutor/corpus.json` (gitignored, built at deploy)
 *      must exist and, for every `NN-*` curriculum section's `GUIDE.md`, contain a
 *      non-empty entry that matches a fresh rebuild. Catches "forgot to rebuild
 *      after editing/adding a GUIDE" and the silent empty-corpus-answers-everything
 *      OUT_OF_SCOPE failure mode.
 *   2. MODEL ROSTER — every model a tier can select must carry a bare first-party
 *      Anthropic id, with no Bedrock `us.` / `anthropic.` prefix left on it. A
 *      surviving prefix is a 404 at request time, which the handler converts into
 *      the in-band error sentinel — a 200 response, a flat Errors metric, and no
 *      way to tell it from a model outage.
 *
 *      This replaced a Bedrock inference-profile ARN check when the tutor moved
 *      to the first-party API (Bedrock never entitled this account to the paid
 *      models). There is deliberately no credential check here: the gate makes no
 *      AWS call so it runs in CI and offline, and reading the secret to validate
 *      it would put the API key somewhere it does not belong. Confirm the secret
 *      exists with `aws secretsmanager describe-secret --secret-id quantum-tutor`
 *      (metadata only, never the value) before deploying.
 *   3. WITHDRAWN CLAIMS — no section may carry the sponsored-hardware promise the
 *      curriculum withdrew on 2026-08-19. Freshness alone does not cover this: a
 *      GUIDE that REINTRODUCES the sentence rebuilds into a perfectly fresh corpus
 *      that this gate would otherwise wave through. The tutor answers only from
 *      this text, so a sentence here is an advertisement in the platform's own
 *      voice for something the wallet cannot fund and the closed storefront cannot
 *      sell. `WITHDRAWN_CLAIM_PATTERNS` is the single source of truth for the bar;
 *      `corpus-freshness.test.mjs` imports it rather than keeping a second copy,
 *      so the deploy path and the test path can never disagree about what is banned.
 *
 * Pure helpers are exported and unit-tested in deploy-check.test.mjs (CI runs it via
 * `node --test`). Not in package.json `files`, so `sam build` never packages it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCorpusEntry } from "./tutor-core.mjs";
import { ROSTER, MODEL_IDS } from "./tutor-billing.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const CORPUS_PATH = path.join(HERE, "corpus.json");

/**
 * True if `id` is a bare first-party Anthropic model id — what `POST /v1/messages`
 * accepts. Rejects the two shapes a half-finished migration leaves behind: a
 * regional inference-profile prefix (`us.`, `global.`) and Bedrock's provider
 * prefix (`anthropic.`). Also rejects a trailing Bedrock version suffix (`-v1:0`)
 * and a date suffix, both of which 404 on this API.
 */
export function isValidAnthropicModelId(id) {
  if (typeof id !== "string") return false;
  const s = id.trim();
  if (s === "") return false;
  if (/^(us|eu|apac|global)\./.test(s)) return false; // regional inference profile
  if (/^anthropic\./.test(s)) return false; // Bedrock provider prefix
  if (/-v\d+:\d+$/.test(s)) return false; // Bedrock version suffix
  return /^claude-[a-z0-9-]+$/.test(s);
}

/** Every model any tier can select must be invocable. Returns problem strings. */
export function modelRosterProblems() {
  const problems = [];
  for (const model of new Set(Object.values(ROSTER).flat())) {
    const id = MODEL_IDS[model];
    if (!id) {
      problems.push(`roster model "${model}" has no entry in MODEL_IDS — selecting it would 404`);
    } else if (!isValidAnthropicModelId(id)) {
      problems.push(`roster model "${model}" maps to "${id}", which is not a bare first-party model id`);
    }
  }
  return problems;
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
      problems.push(`missing: no corpus entry for "${slug}" (run build:corpus)`);
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

/**
 * Wording the curriculum WITHDREW and the deployed system cannot honour. The exact
 * claim that shipped to QL-Prod on 2026-08-29: "a free Workspace account comes with
 * a sponsored budget on IQM Garnet — the platform pays Amazon Braket, you pay
 * nothing." Hardware runs are not funded, the storefront is closed, and every credit
 * in a wallet was paid for, so the promise is false in every direction.
 *
 * This list is exported because it must have exactly one definition. It is enforced
 * on the deploy path (`runPreflight`, and therefore `npm run deploy` and CI) and
 * imported by `corpus-freshness.test.mjs` for the `npm test` path.
 */
export const WITHDRAWN_CLAIM_PATTERNS = [
  /sponsored budget/i,
  /the platform pays/i,
  /you pay nothing/i,
  /sponsor(ed|ship|s)?\s+(budget|allowance|hardware|qpu)/i,
  /patrocinad/i,
];

/**
 * Scan a corpus object for withdrawn claims. Returns human-readable problems
 * (empty ⇒ clean). `where` names the artifact in the message so a failure says
 * which copy is at fault. Pure.
 */
export function withdrawnClaimProblems(corpus, where = "corpus") {
  const problems = [];
  for (const [slug, entry] of Object.entries(corpus)) {
    const text = entry && typeof entry.text === "string" ? entry.text : "";
    for (const re of WITHDRAWN_CLAIM_PATTERNS) {
      if (re.test(text)) {
        problems.push(
          `withdrawn claim: ${where} section "${slug}" matches ${re} — the tutor would ` +
            `advertise sponsored hardware the wallet cannot fund. Fix the GUIDE.md and ` +
            `rebuild; never relax this bar.`
        );
      }
    }
  }
  return problems;
}

export function runPreflight({ corpusPath = CORPUS_PATH, root = REPO_ROOT } = {}) {
  const errors = [];

  for (const p of modelRosterProblems()) errors.push(p);

  let corpus = null;
  try {
    corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  } catch (err) {
    errors.push(`cannot read ${corpusPath}: ${err.message} — run: npm --prefix lambda/tutor run build:corpus`);
  }
  if (corpus) {
    for (const p of corpusFreshnessProblems(corpus, listGuideSections(root), root)) errors.push(p);
    // Content bar, not a freshness check: a GUIDE that reintroduces the withdrawn
    // promise builds a FRESH corpus, so the comparison above would pass it.
    for (const p of withdrawnClaimProblems(corpus, corpusPath)) errors.push(p);
  }
  return errors;
}

function main() {
  const errors = runPreflight();
  if (errors.length) {
    console.error("tutor deploy preflight FAILED:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    "tutor deploy preflight OK — corpus is fresh, carries no withdrawn sponsorship claim, " +
      "and every roster model id is invocable."
  );
}

// Only run the CLI when executed directly, so importing the helpers in tests is side-effect-free.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
