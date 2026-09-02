/**
 * Rule 5, made checkable: every metered surface converts provider cost into
 * charged credits at ONE shared factor. Nothing in this repo may carry the
 * factor's value (rule 6), so what CAN be asserted here is lockstep of the
 * MECHANISM: both stacks read the same secret shape through the same env key,
 * both default to metering-off, and both handlers actually consume that key.
 *
 * The deployed halves (do the two LIVE functions carry the same value?) are
 * outside any repo test's reach — that is scripts/check-rate-parity.mjs, run
 * by `make drift`. This file is the half a clone can see.
 */
import { readFileSync } from "fs";
import { join } from "path";

const REPO = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const tutorTemplate = read("lambda/tutor/template.yaml");
const qpuTemplate = read("lambda/qpu/template.yaml");
const parityCheck = read("scripts/check-rate-parity.mjs");
const tutorIndex = read("lambda/tutor/index.mjs");
const qpuIndex = read("lambda/qpu/index.mjs");
const qpuReconcile = read("lambda/qpu/reconcile.mjs");

// The one contract, spelled once. Both templates must carry this LITERAL line
// (modulo indentation): same env key, same secret parameter name, same JSON
// key inside the secret, same NoValue else-branch.
const RESOLVE_LINE =
  'RATE_CARD: !If [HasRateCard, !Sub "{{resolve:secretsmanager:${RateCardSecret}:SecretString:factor}}", !Ref AWS::NoValue]';

// The env key, taken FROM the contract rather than typed a second time — a
// second literal is a second thing to rename, which is the failure this file
// exists to prevent.
const ENV_KEY = RESOLVE_LINE.split(":")[0];

/**
 * The functions a template configures with the rate factor: the literal
 * FunctionName in whichever resource block carries the resolve line.
 */
const meteredFunctions = (template: string): string[] =>
  template
    .split(/^ {2}(?=[A-Za-z0-9]+:\s*$)/m)
    .filter((block) => block.split("\n").some((line) => line.trim() === RESOLVE_LINE))
    .map((block) => block.match(/^ +FunctionName: (quantum-[\w-]+)\s*$/m)?.[1])
    .filter((name): name is string => Boolean(name));

// The scan and its canary share one regex and one exception list: two copies
// would let the canary keep passing while the scan itself stopped matching.
const NUMERIC_DEFAULT = /^ {4}Default:\s*([\d.]+)\s*$/gm;
// Operational knobs, not money — the only numeric defaults grandfathered in:
// LogRetentionInDays (30), MaxConcurrency (5), MonthlyBraketBudget (150, our
// AWS budget threshold, not a customer-facing figure).
const GRANDFATHERED = ["30", "5", "150"];

describe("the shared rate factor is one mechanism across both metered stacks", () => {
  it.each([
    ["lambda/tutor/template.yaml", tutorTemplate],
    ["lambda/qpu/template.yaml", qpuTemplate],
  ])("%s carries the identical RATE_CARD resolve line", (_name, template) => {
    // Byte-identical modulo leading whitespace: a divergence in env key, secret
    // parameter, or JSON key means the two stacks can be configured apart —
    // which is exactly the rule 5 failure mode this file exists to prevent.
    const lines = template.split("\n").map((l) => l.trim());
    expect(lines).toContain(RESOLVE_LINE);
  });

  it.each([
    ["lambda/tutor/template.yaml", tutorTemplate],
    ["lambda/qpu/template.yaml", qpuTemplate],
  ])("%s defaults RateCardSecret to \"\" — metering OFF from version control", (_name, template) => {
    // A Default carrying a real secret name would let a bare `sam deploy` turn
    // metering on from the repo; a Default carrying a value would publish the
    // spread. Empty string is the only safe resting state.
    const param = template.match(/^ {2}RateCardSecret:\n(?: {4}.*\n)+/m)?.[0] ?? "";
    expect(param).not.toBe("");
    expect(param).toMatch(/^ {4}Default: ""$/m);
  });

  it.each([
    ["lambda/tutor/index.mjs", tutorIndex],
    ["lambda/qpu/index.mjs", qpuIndex],
  ])("%s reads the SAME env key, via Number()", (_name, src) => {
    // The env-key name is load-bearing: check-rate-parity.mjs compares the
    // deployed values under this exact key, so a rename on one side would make
    // the parity check silently vacuous. Pin the code to the templates.
    expect(src).toMatch(/Number\(process\.env\.RATE_CARD\)/);
  });

  it("the deployed check queries the env key the templates set", () => {
    // This file pins the key in the templates and the handlers, and says why:
    // check-rate-parity.mjs compares deployed values under that exact key. But
    // it never read that script, so a coordinated rename kept the suite green
    // while the script queried a key that no longer exists — the CLI returns
    // None, both rows classify ABSENT, and the run prints "metering is off on
    // both surfaces — consistent" and exits 0, indistinguishable from a
    // correct green. Pin the script to the contract too.
    expect(parityCheck).toContain(`Environment.Variables.${ENV_KEY}`);
  });

  it("the deployed check names every function the templates meter", () => {
    // A third metered surface must not be parity-unchecked by omission: the
    // script's list is hand-maintained, and nothing derived it.
    const metered = [...meteredFunctions(tutorTemplate), ...meteredFunctions(qpuTemplate)].sort();
    expect(metered).toEqual(["quantum-qpu-submit", "quantum-tutor"]);

    const listed = parityCheck.match(/^const FUNCTIONS = \[(.*)\];$/m)?.[1] ?? "";
    expect(listed).not.toBe("");
    const checked = [...listed.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    expect(checked).toEqual(metered);
  });

  it("the reconciler neither reads the factor nor carries the env var", () => {
    // reconcile refunds the creditsCharged RECORDED on the task row — it never
    // prices, so it must never carry pricing config. Dead config on a function
    // that ignores it is drift surface, and a parity check that "verified" it
    // would be verifying nothing.
    expect(qpuReconcile).not.toMatch(/RATE_CARD/);
    const reconcileBlock = qpuTemplate.match(/^ {2}ReconcileFunction:\n(?: {4,}.*\n| *\n)+?(?=^ {2}[A-Za-z])/m)?.[0] ?? "";
    expect(reconcileBlock).not.toBe("");
    expect(reconcileBlock).not.toMatch(/RATE_CARD/);
  });

  it.each([
    ["lambda/tutor/template.yaml", tutorTemplate],
    ["lambda/qpu/template.yaml", qpuTemplate],
  ])("%s: no parameter carries a numeric Default", (_name, template) => {
    // The vector the name-based guards cannot see: a sibling parameter
    // (RateFactorFallback: Type: Number, Default: 1.4) carrying the factor
    // under a name nobody banned. Every parameter in both templates is a
    // string today, and money constants live in code where the rule-6 guard
    // scans them — a numeric template Default has no legitimate use here.
    const numericDefaults = [...template.matchAll(NUMERIC_DEFAULT)]
      .map((m) => m[1])
      .filter((v) => !GRANDFATHERED.includes(v));
    expect(numericDefaults).toEqual([]);
  });

  it("the numeric-Default scan still sees the defaults it filters (no silent no-op)", () => {
    // The assertion above passes on an empty list whether the regex found five
    // candidates or zero, because every match today is filtered out. So a
    // re-indent of either template, or moving the parameters under a nested
    // block, would turn the guard into a no-op that still reports green. This
    // is the guard's guard — the shape wallet-ttl.test.ts already uses.
    const found = [tutorTemplate, qpuTemplate].flatMap((template) =>
      [...template.matchAll(NUMERIC_DEFAULT)].map((m) => m[1]),
    );
    expect(found.length).toBeGreaterThanOrEqual(5);
    for (const value of GRANDFATHERED) expect(found).toContain(value);
  });

  it("both kernels REQUIRE the injected factor — no unity default anywhere", () => {
    // The kernels throw a pinned message rather than default to raw cost. The
    // assertion here is textual (each lambda's own suite proves the behaviour):
    // the pinned message exists, and no default parameter value sneaks in.
    const tutorKernel = read("lambda/tutor/tutor-billing.mjs");
    const qpuKernel = read("lambda/qpu/qpu-core.mjs");
    expect(tutorKernel).toMatch(/rate factor missing or invalid/);
    expect(qpuKernel).toMatch(/rate factor missing or invalid/);
    expect(tutorKernel).not.toMatch(/factor\s*=\s*1\b/);
    expect(qpuKernel).not.toMatch(/factor\s*=\s*1\b/);
  });
});
