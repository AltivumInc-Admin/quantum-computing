/**
 * Is the drift check's FUNCTIONS registry complete?
 *
 * FUNCTIONS is hand-maintained against the CloudFormation templates that
 * declare those names — the fourth such list in this repo, and
 * lambda/analytics/README.md records that lambda/stripe was missed in two of
 * the others for three weeks. A function added to a template but never added
 * here is simply not downloaded, and the run still prints "All N unheld
 * functions match git": a green report that silently excludes it.
 *
 * So the expected set is DERIVED here, from the templates themselves, and
 * compared to the registry in both directions. No AWS, no network — this is a
 * property of the repository.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FUNCTIONS, UNDERIVABLE, declaredFunctionNames, registryGaps } from "./rules.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every { fn, dir } a lambda template declares as a literal FunctionName. */
const declaredInTemplates = () => {
  const declared = [];
  for (const entry of readdirSync(join(REPO, "lambda"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const template = join(REPO, "lambda", entry.name, "template.yaml");
    if (!existsSync(template)) continue;
    for (const fn of declaredFunctionNames(readFileSync(template, "utf8"))) {
      declared.push({ fn, dir: `lambda/${entry.name}` });
    }
  }
  return declared;
};

test("the templates still declare function names (this guard must not no-op)", () => {
  // A regex that matches nothing would let every assertion below pass forever.
  const declared = declaredInTemplates();
  assert.ok(declared.length >= 9, `expected the templates to declare at least 9 functions, saw ${declared.length}`);
  assert.ok(declared.some((d) => d.fn === "quantum-tutor" && d.dir === "lambda/tutor"));
});

test("every function a template declares is registered for the drift check", () => {
  const { unregistered } = registryGaps(declaredInTemplates(), FUNCTIONS);
  assert.deepEqual(
    unregistered,
    [],
    "a template declares a function the drift check never downloads — add it to FUNCTIONS in scripts/drift/rules.mjs",
  );
});

test("every registered function is declared by a template, or excused with a reason", () => {
  const { underived } = registryGaps(declaredInTemplates(), FUNCTIONS);
  assert.deepEqual(
    underived,
    [],
    "FUNCTIONS names something no template declares — a typo, or a function that no longer exists",
  );
});

test("a registered function is built from the directory whose template declares it", () => {
  assert.deepEqual(registryGaps(declaredInTemplates(), FUNCTIONS).misdirected, []);
});

test("the only excused names are the parameterized stripe pair, each with a reason", () => {
  assert.deepEqual(UNDERIVABLE.map((u) => u.fn), ["quantum-stripe", "quantum-stripe-sandbox"]);
  for (const u of UNDERIVABLE) assert.ok(u.reason.length > 40, `${u.fn} needs a written reason`);
  const stripe = readFileSync(join(REPO, "lambda", "stripe", "template.yaml"), "utf8");
  // The reason has to stay true: the moment that template pins a literal name,
  // the exemption is stale and both entries belong in the derived set.
  assert.match(stripe, /FunctionName: !Ref NamePrefix/);
  assert.deepEqual(declaredFunctionNames(stripe), []);
});

test("a function present in a template but missing from the registry is caught", () => {
  const declared = [{ fn: "quantum-newthing", dir: "lambda/newthing" }];
  assert.deepEqual(registryGaps(declared, [], []).unregistered, declared);
});

test("a registered name no template declares is caught, unless excused", () => {
  const registered = [{ fn: "quantum-ghost", dir: "lambda/ghost" }];
  assert.deepEqual(registryGaps([], registered, []).underived, registered);
  assert.deepEqual(registryGaps([], registered, [{ fn: "quantum-ghost", reason: "x" }]).underived, []);
});

test("a registry entry pointing at the wrong directory is caught", () => {
  const gaps = registryGaps(
    [{ fn: "quantum-tutor", dir: "lambda/tutor" }],
    [{ fn: "quantum-tutor", dir: "lambda/sync" }],
    [],
  );
  assert.deepEqual(gaps.misdirected, [
    { fn: "quantum-tutor", declaredIn: "lambda/tutor", registeredAs: "lambda/sync" },
  ]);
});

test("a commented-out or !Ref FunctionName is not a declaration", () => {
  const template = [
    "      # function name is pinned (FunctionName: quantum-tutor), so the literal",
    "      FunctionName: !Ref NamePrefix",
    "      FunctionName: quantum-real",
  ].join("\n");
  assert.deepEqual(declaredFunctionNames(template), ["quantum-real"]);
});
