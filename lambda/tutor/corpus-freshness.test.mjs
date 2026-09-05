/**
 * Offline proof that the corpus on disk is the corpus the GUIDEs describe.
 *
 * WHY THIS EXISTS. `deploy-check.mjs` already catches a stale corpus perfectly —
 * pointed at the artifact that shipped to QL-Prod on 2026-08-29 it emits three
 * `stale:` lines and exits 1. It was never run: npm fires `predeploy` only for
 * `npm run deploy`, and that deploy was a hand-typed `sam build && sam deploy`.
 * The shipped corpus predated 2026-08-19 and told learners, in the platform's own
 * voice, that a free account came with a sponsored budget on IQM Garnet — a
 * promise the curriculum had withdrawn and the wallet cannot fund.
 *
 * So the gate needed a path that cannot be skipped. This file is one of them: it
 * runs under `npm test`, needs no credentials and no network, and fails the same
 * way the preflight would.
 *
 * NOTE ON THE COMPARISON, AND ON WHAT CI CANNOT SEE. corpus.json is gitignored
 * (.gitignore:49) and untracked — it is a build artifact, so there is no
 * "committed corpus.json" to diff against. The load-bearing comparison is
 * therefore *fresh build vs the file on disk*, which is precisely the failure
 * that shipped: the operator's working tree held a stale artifact and `sam build`
 * packaged it verbatim.
 *
 * That makes the byte-comparison a LOCAL guard, and only a local guard. No CI path
 * can detect a stale artifact, and none is written to pretend otherwise: on a
 * clean checkout the file is absent and this test skips, and tutor-corpus.yml
 * builds the corpus itself before running the suite, so there it compares the file
 * to the build it just made. Staleness is a property of somebody's working tree,
 * and CI never has one. What CI genuinely proves is the other half — that a fresh
 * build from the GUIDEs on `main` passes the preflight and carries no withdrawn
 * claim — and the content guards below run either way, against a temp-dir build.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  runPreflight,
  listGuideSections,
  WITHDRAWN_CLAIM_PATTERNS,
  withdrawnClaimProblems,
} from "./deploy-check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const BUILDER = path.join(REPO_ROOT, "scripts", "build_tutor_corpus.mjs");
const ON_DISK = path.join(HERE, "corpus.json");

const REBUILD = "npm --prefix lambda/tutor run build:corpus";

/** Build the corpus into a scratch dir. Never touches lambda/tutor/corpus.json. */
function buildFresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-corpus-"));
  const out = path.join(dir, "corpus.json");
  execFileSync(process.execPath, [BUILDER], {
    cwd: REPO_ROOT,
    env: { ...process.env, TUTOR_CORPUS_OUT: out },
    stdio: "pipe",
  });
  return { dir, out, raw: fs.readFileSync(out, "utf8") };
}

test("a fresh build of every GUIDE passes the deploy preflight", () => {
  const { dir, out } = buildFresh();
  try {
    const problems = runPreflight({ corpusPath: out, root: REPO_ROOT });
    assert.deepEqual(problems, [], `fresh corpus failed preflight:\n  ${problems.join("\n  ")}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("corpus.json on disk matches a fresh build (the 2026-08-29 failure)", (t) => {
  if (!fs.existsSync(ON_DISK)) {
    // Clean checkout: the artifact has not been built yet. Nothing to be stale.
    t.skip(`no corpus.json on disk yet — build it with: ${REBUILD}`);
    return;
  }
  const { dir, raw } = buildFresh();
  try {
    const have = fs.readFileSync(ON_DISK, "utf8");
    assert.equal(
      have,
      raw,
      `lambda/tutor/corpus.json is STALE — it does not match a rebuild from the ` +
        `current GUIDE.md files. Packaging it would deploy prose the curriculum ` +
        `has already changed. Fix the artifact, never this test:\n  ${REBUILD}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the built corpus covers every curriculum section with real grounding text", () => {
  const { dir, raw } = buildFresh();
  try {
    const corpus = JSON.parse(raw);
    assert.deepEqual(Object.keys(corpus).sort(), listGuideSections(REPO_ROOT));
    for (const [slug, entry] of Object.entries(corpus)) {
      assert.ok(entry.title && entry.title.trim(), `${slug} has no title`);
      assert.ok(entry.text && entry.text.trim().length > 1000, `${slug} has no grounding text`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the built corpus carries no withdrawn sponsored-hardware promise", () => {
  // The bar itself lives in deploy-check.mjs, so the DEPLOY path enforces it too.
  // It used to live here, which meant `npm run deploy` shipped whatever the GUIDEs
  // said: this test is not on any deploy path. Importing it keeps one definition.
  const { dir, raw } = buildFresh();
  try {
    // Both the fresh build (so a GUIDE edit cannot reintroduce it) and the
    // artifact on disk (so a stale file cannot ship it, which is what happened).
    const sources = [["fresh build", raw]];
    if (fs.existsSync(ON_DISK)) sources.push(["lambda/tutor/corpus.json", fs.readFileSync(ON_DISK, "utf8")]);
    for (const [where, json] of sources) {
      const problems = withdrawnClaimProblems(JSON.parse(json), where);
      assert.deepEqual(
        problems,
        [],
        `${where} still carries a withdrawn sponsorship claim. Fix the GUIDE.md and ` +
          `rebuild (${REBUILD}) — never relax this bar:\n  ${problems.join("\n  ")}`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the deploy preflight itself rejects a withdrawn sponsorship claim", () => {
  // The regression guard for the gap this file used to have: prove the bar fires
  // through runPreflight (what `npm run deploy` and CI actually call), not just
  // through the assertion above. Poisons a corpus in a temp dir; never touches the
  // real artifact or any GUIDE.
  const { dir, out, raw } = buildFresh();
  try {
    const poisoned = JSON.parse(raw);
    const slug = Object.keys(poisoned)[0];
    poisoned[slug] = {
      ...poisoned[slug],
      text:
        poisoned[slug].text +
        "\n\nA free Workspace account comes with a sponsored budget on IQM Garnet — " +
        "the platform pays Amazon Braket, you pay nothing.",
    };
    fs.writeFileSync(out, JSON.stringify(poisoned));
    const problems = runPreflight({ corpusPath: out, root: REPO_ROOT });
    assert.ok(
      problems.some((p) => p.startsWith("withdrawn claim:")),
      `runPreflight waved through a withdrawn sponsorship claim. Problems were:\n  ${problems.join("\n  ")}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the withdrawn-claim bar still covers the sentence that actually shipped", () => {
  // Anchors the pattern list to the real 2026-08-29 artifact wording, so a future
  // edit to WITHDRAWN_CLAIM_PATTERNS cannot quietly stop catching it.
  const shipped =
    "A free Workspace account comes with a sponsored budget on IQM Garnet — " +
    "the platform pays Amazon Braket, you pay nothing.";
  assert.ok(
    WITHDRAWN_CLAIM_PATTERNS.some((re) => re.test(shipped)),
    "no pattern matches the sentence that shipped to QL-Prod on 2026-08-29"
  );
  assert.deepEqual(withdrawnClaimProblems({ "00-prereqs": { text: "Local simulation is free." } }), []);
});

test("02-hardware states the present truth about hardware access", () => {
  const { dir, raw } = buildFresh();
  try {
    const text = JSON.parse(raw)["02-hardware"].text;
    assert.match(text, /Hardware runs are not currently available on the platform/);
    assert.match(text, /you need your own AWS account/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
