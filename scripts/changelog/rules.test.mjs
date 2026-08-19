import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verdict, isLearnerVisible, LEARNER_VISIBLE, CHANGELOG_FILE } from "./rules.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("a pull request touching nothing learner-visible needs no changelog edit", () => {
  const v = verdict(["lambda/stripe/index.mjs", "docs/pricing-cost-basis.md", "Makefile"]);
  assert.equal(v.ok, true);
  assert.equal(v.reason, "no-learner-paths");
});

test("a learner-visible change with no changelog edit is refused", () => {
  const v = verdict(["web/src/components/footer.tsx"]);
  assert.equal(v.ok, false);
  assert.equal(v.reason, "unannounced");
  assert.deepEqual(v.offenders, ["web/src/components/footer.tsx"]);
});

test("touching the changelog satisfies the guard", () => {
  const v = verdict(["web/src/components/footer.tsx", CHANGELOG_FILE]);
  assert.equal(v.ok, true);
  assert.equal(v.reason, "changelog-touched");
});

test("the Spanish twin alone does NOT satisfy it", () => {
  // CHANGELOG and SILENT both live in changelog.ts, so that is the file which
  // must move under either outcome. Accepting the twin would let a translation
  // edit satisfy a guard about announcements.
  const v = verdict(["web/src/components/footer.tsx", "web/src/lib/changelog-es.ts"]);
  assert.equal(v.ok, false);
  assert.equal(v.reason, "unannounced");
});

test("an empty diff is a wiring fault, never a pass", () => {
  // A shallow clone with no merge base produces no paths. Treating that as a
  // pass would switch the guard off silently for every pull request, and
  // nothing would ever report it.
  assert.equal(verdict([]).reason, "no-diff");
  assert.equal(verdict([""]).reason, "no-diff");
  assert.equal(verdict(["", "   "]).reason, "no-diff");
  assert.equal(verdict([]).ok, false);
});

test("curriculum notebooks, guides and scripts are learner-visible", () => {
  for (const p of [
    "03-algorithms/notebooks/02-grover-search.ipynb",
    "03-algorithms/GUIDE.md",
    "03-algorithms/GUIDE.es.md",
    "03-algorithms/scripts/oracles.py",
    "00-prereqs/notebooks/01-python.ipynb",
    "web/src/app/pricing/page.tsx",
    "web/src/components/footer.tsx",
    "web/src/i18n/locales/es.ts",
    "web/src/lib/glossary.ts",
    "web/src/lib/glossary-es.ts",
  ]) {
    assert.equal(isLearnerVisible(p), true, p);
  }
});

test("the lib/ modules that ARE rendered copy are learner-visible", () => {
  // pricing.ts first and deliberately: TIERS, HARDWARE_RATES and TUTOR_RATES are
  // the public /pricing page. This list asserted the OPPOSITE of that line until
  // 2026-08-19 — it pinned the claim that a repricing needs no announcement,
  // which in a repo whose rule 13 exists because a stale grant once rendered
  // beside a new price is the worst thing the guard could have been taught.
  for (const p of [
    "web/src/lib/pricing.ts",
    "web/src/lib/sections.ts",
    "web/src/lib/content.ts",
    "web/src/lib/section-pitch.ts",
    "web/src/lib/runbook.ts",
    "web/src/lib/credentials.ts",
    "web/src/lib/founding-ten.ts",
    "web/src/data/founding-ten.json",
    "web/src/hooks/use-progress.ts",
  ]) {
    assert.equal(isLearnerVisible(p), true, p);
  }
});

test("the lib/ modules that are machinery are not", () => {
  // web/src/lib is listed file by file precisely because it holds both. A grader,
  // a transport or a hash is announced (or not) by whatever renders it.
  for (const p of [
    "web/src/lib/circuit-store.ts",
    "web/src/lib/sha256.ts",
    "web/src/lib/predict-grade.ts",
    "web/src/lib/sync-client.ts",
    "web/src/lib/pyodide-runtime.ts",
  ]) {
    assert.equal(isLearnerVisible(p), false, p);
  }
});

test("the deliberate exclusions stay excluded", () => {
  // Decisions, documented in rules.mjs. content/reps/ is the community
  // contribution path README documents as "add one file, open a pull request";
  // web/public/ is generated JupyterLite and Pyodide output that moves on every
  // build; changelog-es.ts alone is a correction to an announcement that already
  // shipped, not a new announcement.
  for (const p of [
    "content/reps/community-ghz-reachable-1.json",
    "web/public/lab/index.html",
    "web/public/pyodide/pyodide.asm.wasm",
    "web/src/lib/changelog-es.ts",
  ]) {
    assert.equal(isLearnerVisible(p), false, p);
  }
});

test("tests, infra, docs, scripts and the Lambdas are not learner-visible", () => {
  for (const p of [
    "web/__tests__/components/footer.test.tsx",
    "tests/test_oracles.py",
    "docs/superpowers/specs/2026-08-19-changelog-design.md",
    "lambda/qpu/qpu-core.mjs",
    "infra/template.yaml",
    ".github/workflows/ci.yml",
    "scripts/changelog/rules.mjs",
    "web/src/i18n/translate.ts",
    "Makefile",
  ]) {
    assert.equal(isLearnerVisible(p), false, p);
  }
});

test("a directory prefix never matches a sibling that merely starts the same way", () => {
  assert.equal(isLearnerVisible("web/src/app-shell/thing.ts"), false);
  assert.equal(isLearnerVisible("web/src/components-legacy/x.tsx"), false);
  assert.equal(isLearnerVisible("web/src/libs/glossary.ts"), false);
  assert.equal(isLearnerVisible("web/src/database/seed.ts"), false);
  assert.equal(isLearnerVisible("web/src/hooks-legacy/use-x.ts"), false);
  assert.equal(isLearnerVisible("01-foundations-old/GUIDE.md"), false);
});

test("an exact-path entry matches that file and nothing near it", () => {
  // The lib/ entries carry no trailing slash, so they are exact paths. A
  // neighbour that merely shares the prefix must not match.
  assert.equal(isLearnerVisible("web/src/lib/pricing.ts"), true);
  assert.equal(isLearnerVisible("web/src/lib/pricing.test.ts"), false);
  assert.equal(isLearnerVisible("web/src/lib/pricing-helpers.ts"), false);
  assert.equal(isLearnerVisible("web/src/lib/sections-legacy.ts"), false);
});

test("every watched path still exists in the repo it guards", () => {
  // A renamed or deleted directory would silently narrow the guard toward
  // watching nothing, while continuing to pass every run. Asserted against the
  // real tree, the way scripts/founding-credit/issue.test.mjs asserts against
  // the shipped roster rather than only synthetic fixtures.
  for (const p of LEARNER_VISIBLE) {
    assert.ok(existsSync(join(REPO, p)), `LEARNER_VISIBLE entry no longer exists: ${p}`);
  }
  assert.ok(existsSync(join(REPO, CHANGELOG_FILE)), `missing: ${CHANGELOG_FILE}`);
});
