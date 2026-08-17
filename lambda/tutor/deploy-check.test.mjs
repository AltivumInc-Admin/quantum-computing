/**
 * Unit tests for the deploy preflight gate (deploy-check.mjs). The pure helpers are
 * exercised here with fixtures (a temp GUIDE.md tree + in-memory corpus), so they run
 * in CI under `node --test` with no AWS, no real corpus.json, and no network.
 *
 * Run: `cd lambda/tutor && npm install && node --test`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isValidAnthropicModelId,
  modelRosterProblems,
  listGuideSections,
  corpusFreshnessProblems,
} from "./deploy-check.mjs";
import { buildCorpusEntry } from "./tutor-core.mjs";

test("isValidAnthropicModelId: accepts the bare first-party ids the handler sends", () => {
  for (const id of ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5"]) {
    assert.equal(isValidAnthropicModelId(id), true, id);
  }
});

test("isValidAnthropicModelId: rejects every shape a half-finished migration leaves behind", () => {
  const bad = [
    "us.anthropic.claude-sonnet-5", // Bedrock cross-region inference profile
    "global.anthropic.claude-opus-5",
    "anthropic.claude-sonnet-5", // Bedrock provider prefix
    "us.anthropic.claude-haiku-4-5-20251001-v1:0", // profile + version suffix
    "claude-haiku-4-5-20251001-v1:0", // bare id with a Bedrock version suffix
    "arn:aws:bedrock:us-east-2:000000000000:inference-profile/us.anthropic.claude-opus-5",
    "",
    "   ",
    undefined,
    null,
    42,
  ];
  for (const id of bad) assert.equal(isValidAnthropicModelId(id), false, JSON.stringify(id));
});

test("every model any tier can select is actually invocable", () => {
  // The gate that would have caught the migration half-done: a tier naming a
  // model whose id still carries a Bedrock prefix 404s at request time, and the
  // handler turns that into the in-band sentinel — HTTP 200, flat Errors metric,
  // indistinguishable from a model outage.
  assert.deepEqual(modelRosterProblems(), []);
});

// --- corpus freshness, against a temp GUIDE.md fixture tree ---------------------

function makeFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-corpus-"));
  fs.mkdirSync(path.join(root, "00-intro"));
  fs.writeFileSync(path.join(root, "00-intro", "GUIDE.md"), "# Intro\n## A\nalpha body\n");
  fs.mkdirSync(path.join(root, "01-next"));
  fs.writeFileSync(path.join(root, "01-next", "GUIDE.md"), "# Next\n## B\nbeta body\n");
  // a non-section dir + a section without GUIDE.md, both must be ignored by discovery
  fs.mkdirSync(path.join(root, "lib"));
  fs.mkdirSync(path.join(root, "99-noguide"));
  return root;
}

function freshCorpus(root, sections) {
  const corpus = {};
  for (const slug of sections) {
    const md = fs.readFileSync(path.join(root, slug, "GUIDE.md"), "utf8");
    corpus[slug] = buildCorpusEntry(md, { fallbackTitle: slug }).entry;
  }
  return corpus;
}

test("listGuideSections: only NN-* dirs that actually have a GUIDE.md, sorted", () => {
  const root = makeFixtureRoot();
  assert.deepEqual(listGuideSections(root), ["00-intro", "01-next"]);
});

test("corpusFreshnessProblems: a freshly built corpus has no problems", () => {
  const root = makeFixtureRoot();
  const sections = listGuideSections(root);
  assert.deepEqual(corpusFreshnessProblems(freshCorpus(root, sections), sections, root), []);
});

test("corpusFreshnessProblems: flags a missing section, an empty entry, a stale entry, and an orphan", () => {
  const root = makeFixtureRoot();
  const sections = listGuideSections(root);

  // missing 01-next
  const missing = freshCorpus(root, sections);
  delete missing["01-next"];
  assert.ok(corpusFreshnessProblems(missing, sections, root).some((p) => /missing.*01-next/.test(p)));

  // empty text
  const empty = freshCorpus(root, sections);
  empty["00-intro"] = { ...empty["00-intro"], text: "  " };
  assert.ok(corpusFreshnessProblems(empty, sections, root).some((p) => /empty.*00-intro/.test(p)));

  // stale: GUIDE edited after the corpus was built (text no longer matches a fresh build)
  const stale = freshCorpus(root, sections);
  stale["00-intro"] = { ...stale["00-intro"], text: "outdated body that no longer matches the GUIDE" };
  assert.ok(corpusFreshnessProblems(stale, sections, root).some((p) => /stale.*00-intro/.test(p)));

  // orphan: corpus entry with no matching GUIDE.md dir
  const orphan = freshCorpus(root, sections);
  orphan["07-removed"] = { title: "Gone", headings: [], text: "x" };
  assert.ok(corpusFreshnessProblems(orphan, sections, root).some((p) => /stale.*07-removed/.test(p)));
});
