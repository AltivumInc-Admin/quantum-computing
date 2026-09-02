/**
 * The rate-parity rules, exercised with no AWS, no network and no node_modules.
 *
 * Every branch here is a rule 5 verdict about DEPLOYED configuration, and the
 * only way to see one live is to deploy a wrong one. So they are decided over
 * plain rows instead, and asserted here.
 *
 * The fixture values below are FICTIONAL integers, chosen to exercise equality
 * and the handler's Number() gate. Nothing in this file is, or resembles, a
 * real rate factor (rule 6).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { classify, normalizeRateCard, verdict } from "./rate-rules.mjs";

test("the CLI's None, and an empty read, both mean absent", () => {
  assert.equal(normalizeRateCard("None"), undefined);
  assert.equal(normalizeRateCard(""), undefined);
  assert.equal(normalizeRateCard("   \n"), undefined);
  assert.equal(normalizeRateCard(undefined), undefined);
});

test("a read value is trimmed and kept", () => {
  assert.equal(normalizeRateCard("7\n"), "7");
});

test("classify separates absent, usable and refused-by-the-gate", () => {
  assert.equal(classify(undefined), "ABSENT");
  assert.equal(classify("7"), "PRESENT");
  assert.equal(classify("0"), "PRESENT-UNUSABLE");
  assert.equal(classify("-3"), "PRESENT-UNUSABLE");
  assert.equal(classify("not-a-number"), "PRESENT-UNUSABLE");
});

test("metering off on both surfaces is consistent", () => {
  const v = verdict([{ fn: "a", state: "ABSENT" }, { fn: "b", state: "ABSENT" }], 0);
  assert.equal(v.exitCode, 0);
  assert.match(v.lines.join("\n"), /metering is off on both surfaces/);
});

test("both surfaces carrying the identical value is consistent", () => {
  const v = verdict([{ fn: "a", state: "PRESENT" }, { fn: "b", state: "PRESENT" }], 1);
  assert.equal(v.exitCode, 0);
  assert.match(v.lines.join("\n"), /identical rate configuration \(MATCH\)/);
});

test("one configured surface beside an unconfigured one fails", () => {
  const v = verdict([{ fn: "a", state: "PRESENT" }, { fn: "b", state: "ABSENT" }], 1);
  assert.equal(v.exitCode, 1);
  assert.match(v.lines.join("\n"), /one surface is configured and the other is not/);
});

test("two distinct values fail — one wallet cannot carry two rates", () => {
  const v = verdict([{ fn: "a", state: "PRESENT" }, { fn: "b", state: "PRESENT" }], 2);
  assert.equal(v.exitCode, 1);
  assert.match(v.lines.join("\n"), /carry DIFFERENT values/);
});

test("a value the handler's gate would refuse fails first, before any other verdict", () => {
  const v = verdict([{ fn: "a", state: "PRESENT-UNUSABLE" }, { fn: "b", state: "ABSENT" }], 1);
  assert.equal(v.exitCode, 1);
  assert.match(v.lines.join("\n"), /would be refused by the handler's gate/);
});

test("no verdict line can carry a value — only rows and counts reach it", () => {
  // Rule 6, structurally: verdict() is given a COUNT of distinct values, never
  // the values, so there is nothing for it to print even by accident.
  const lines = verdict([{ fn: "a", state: "PRESENT" }, { fn: "b", state: "PRESENT" }], 2).lines;
  assert.doesNotMatch(lines.join("\n"), /\d+\.\d+/);
});
