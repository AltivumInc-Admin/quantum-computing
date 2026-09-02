/**
 * The drift check's rules: what counts as source, which drift is HELD, when a
 * hold has gone stale, and what the run's verdict is.
 *
 * Pure and dependency-free so rules.test.mjs can exercise it with no AWS
 * credentials, no network and no node_modules — the same split
 * scripts/changelog already uses. check-lambda-drift.mjs is the I/O shell: it
 * downloads and unzips each artifact and hands the finished rows here.
 *
 * The split exists because the interesting cases are the ones a live run can
 * never rehearse on demand: a declared hold, a hold that stopped holding, a
 * function that could not be reached at all. Those are decided here, over
 * plain objects, and are therefore testable.
 *
 * A result row, as this module expects it:
 *   { fn, dir, ok, drifted[], missing[], lastModified }   checked
 *   { fn, dir, ok: false, error }                         could not be checked
 */
import { targetLabel } from "./account.mjs";

/**
 * Deployed function -> the source directory it is built from. One entry per function,
 * because several stacks ship more than one function from a single directory.
 *
 * It lives HERE, in the pure module, for one reason: this is a hand-maintained
 * registry — the fourth in this repo, and lambda/analytics/README.md records
 * that lambda/stripe was missed in two of the others for three weeks. A
 * registry needs a guard, and a guard needs to import it without AWS.
 * registryGaps() below compares it to what the templates actually declare.
 */
export const FUNCTIONS = [
  { fn: "quantum-stripe", dir: "lambda/stripe" },
  // The sandbox stack runs the SAME source and is where payment changes are
  // rehearsed. Unwatched, a green e2e run is a claim about deployed sandbox code
  // that nothing ties to git — a false green, which is worse than no green.
  // NOTE: red here has two meanings, unlike every other row: "deploy it" or
  // "you are mid-rehearsal with an unmerged branch checked out".
  { fn: "quantum-stripe-sandbox", dir: "lambda/stripe" },
  { fn: "quantum-tutor", dir: "lambda/tutor" },
  { fn: "quantum-qpu-submit", dir: "lambda/qpu" },
  { fn: "quantum-qpu-reconcile", dir: "lambda/qpu" },
  { fn: "quantum-qpu-killswitch", dir: "lambda/qpu" },
  { fn: "quantum-workspace-sync", dir: "lambda/sync" },
  { fn: "quantum-analytics", dir: "lambda/analytics" },
  { fn: "quantum-review-email-prefs", dir: "lambda/review-email" },
  { fn: "quantum-review-email-sender", dir: "lambda/review-email" },
  { fn: "quantum-review-email-unsubscribe", dir: "lambda/review-email" },
];

/**
 * Registered names no template DECLARES literally, each with a reason.
 *
 * Keep this at the length it is. The one legitimate case is a template whose
 * FunctionName is a parameter, which is deployed twice under two names — there
 * is nothing in git for a scanner to find, so the exemption is written down
 * instead, in the style of the ALLOWED map in no-commercial-terms.test.ts.
 */
export const UNDERIVABLE = [
  {
    fn: "quantum-stripe",
    reason:
      "lambda/stripe/template.yaml declares `FunctionName: !Ref NamePrefix`; quantum-stripe is that parameter's Default, not a literal in the file.",
  },
  {
    fn: "quantum-stripe-sandbox",
    reason:
      "the same template deployed a second time with NamePrefix overridden — the sandbox twin, where payment changes are rehearsed.",
  },
];

/**
 * Every function a CloudFormation template declares with a LITERAL name, and
 * the entry point it declares for it.
 *
 * Split on top-level resource keys so a Handler is attributed to the function
 * in its own block and not to a neighbour's.
 */
export function declaredFunctions(template) {
  const declared = [];
  for (const block of String(template).split(/^ {2}(?=[A-Za-z0-9]+: *$)/m)) {
    const fn = block.match(/^ *FunctionName: *(quantum-[A-Za-z0-9-]+) *$/m)?.[1];
    if (!fn) continue;
    declared.push({ fn, handler: block.match(/^ *Handler: *(\S+) *$/m)?.[1] });
  }
  return declared;
}

/** Function names a CloudFormation template declares as a literal. */
export const declaredFunctionNames = (template) => declaredFunctions(template).map((d) => d.fn);

/**
 * Is the DEPLOYED entry point the one the template declares?
 *
 * Comparing files answers "does the shipped code match git" but not "does the
 * function still run the file we think it runs". A Handler repointed at
 * another module — by a console edit, or a deploy from a branch — leaves every
 * compared byte identical and changes what actually executes. Absent on either
 * side means there is nothing to compare, not a mismatch: lambda/stripe names
 * its function through a parameter, so no template literal exists for it.
 */
export const handlerMismatch = (deployed, declared) =>
  deployed && declared && deployed !== declared ? { deployed, declared } : null;

/**
 * Does the registry match what the templates declare?
 *
 * Fails in BOTH directions on purpose. A function added to a template but not
 * here is never downloaded and the summary still says "All N unheld functions
 * match git" — a green report that silently excludes it. A name here that no
 * template declares is either a typo or a function that no longer exists, and
 * both read as "could not check" forever.
 */
export function registryGaps(declared, registered, underivable = UNDERIVABLE) {
  const excused = new Set(underivable.map((u) => u.fn));
  const byName = new Map(registered.map((r) => [r.fn, r]));
  const unregistered = declared.filter((d) => !byName.has(d.fn));
  const underived = registered.filter((r) => !excused.has(r.fn) && !declared.some((d) => d.fn === r.fn));
  const misdirected = declared
    .filter((d) => byName.has(d.fn) && byName.get(d.fn).dir !== d.dir)
    .map((d) => ({ fn: d.fn, declaredIn: d.dir, registeredAs: byName.get(d.fn).dir }));
  return { unregistered, underived, misdirected };
}

/**
 * Strip any URL from text bound for a public log.
 *
 * execFileSync's thrown message is literally "Command failed: " + the whole
 * argv, and the argv of the download step carries the PRESIGNED package URL —
 * X-Amz-Signature and X-Amz-Security-Token included — which would grant an
 * anonymous reader of a public Actions log the production deployment package
 * for the URL's validity window. Redacting by shape, rather than by knowing
 * which call is risky, is what keeps a future subprocess from regressing it.
 */
export const redact = (text) => String(text ?? "").replace(/https?:\/\/\S+/g, "<url redacted>");

/**
 * What to print for a step that threw: the child's own first stderr line.
 *
 * err.message is the argv (see redact above) AND it is the same string for
 * every failure, so a deleted function, an expired token and a network blip all
 * rendered identically. stderr is where ResourceNotFoundException lives — the
 * production event this guard is uniquely placed to catch — so that is what the
 * row reports, falling back to the stage's name when the child said nothing.
 */
export function failureReason(err, stage) {
  const line = String(err?.stderr ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return redact(line || stage).slice(0, 200);
}

/** Hand-written source among these filenames: .mjs/.js at the top level, minus tests. */
export const sourceFiles = (names) =>
  names
    .filter((f) => /\.(mjs|js)$/.test(f))
    .filter((f) => !/\.test\.mjs$|^probe-|^verify-/.test(f));

/**
 * A row that compared NOTHING: no file was read on both sides.
 *
 * Zero comparisons satisfies "nothing differed", so without this a function
 * whose artifact unzipped into a nested directory, whose sources moved, or
 * whose zip fetched partially prints OK and lands in "All N unheld functions
 * match git" — a false green produced by the guard that exists to catch false
 * greens. A hold cannot excuse it either: a hold declares that DRIFT is
 * deliberate, and nothing here was compared closely enough to have drifted.
 */
export const isVacuous = (r) => !r.error && (r.compared ?? 0) === 0;

/** The HELD entry covering this function, if any. */
export const heldFor = (held, fn) => held.find((h) => h.fn.test(fn));

/**
 * Record, ONCE, whether each row's drift is deliberate.
 *
 * Held-ness used to be re-derived four times — once to decide the exit code,
 * once per row while printing, and twice more to build the summary lists — and
 * the result object never carried it. So --json, a documented mode, emitted
 * ok:false for the deliberately-held functions with no way to tell them from
 * real drift: the exact distinction the HELD mechanism exists to make.
 *
 * A row is held only if it is a CHECKED row that actually drifted. An outage is
 * not a deliberate hold, and neither is a comparison of nothing.
 */
export const stampHolds = (results, held) =>
  results.map((r) => {
    const hold = !r.error && !r.ok && !isVacuous(r) ? heldFor(held, r.fn) : undefined;
    return {
      ...r,
      held: hold ? { pattern: String(hold.fn), reason: hold.reason, clearsWhen: hold.clearsWhen } : null,
    };
  });

/**
 * A hold that no longer holds anything is stale, and a stale allowlist is how
 * a real gap eventually hides behind an entry nobody re-read.
 */
export const staleHolds = (held, results) =>
  held.filter((h) => !results.some((r) => r.held && h.fn.test(r.fn)));

/**
 * The verdict for a finished run: exit code and the summary partitions.
 *
 * `results` must be stamped (see stampHolds); `held` is needed only to report
 * a hold that has stopped holding anything.
 */
export function verdict(results, held = []) {
  // THREE partitions, not two. A row that threw was never read, so it is neither
  // a match nor a mismatch: counting it as drift told an operator to "deploy the
  // drifted functions" about a function whose artifact was never fetched, and
  // counting an unreachable HELD row as held claimed a deliberate hold on an
  // outage. Every summary below is computed from `checked` alone.
  const unchecked = results.filter((r) => r.error);
  const checked = results.filter((r) => !r.error);
  const vacuous = checked.filter(isVacuous);
  const bad = checked.filter((r) => !r.ok && !isVacuous(r) && !r.held);
  const heldRows = checked.filter((r) => r.held);
  // Drift and could-not-check are accumulated SEPARATELY: one Math.max let an
  // unrelated credentials failure promote a real drift exit of 1 to 2, and one
  // plain assignment let a later clean row demote a 2 to 1. Drift wins, because
  // "somebody owes a deploy" is the actionable half and must not be hidden
  // behind an infrastructure excuse.
  const drifted = bad.length > 0 || vacuous.length > 0;
  const exitCode = drifted ? 1 : unchecked.length ? 2 : 0;
  return { exitCode, bad, vacuous, unchecked, checked, held: heldRows, staleHolds: staleHolds(held, results) };
}

/**
 * The human report, as lines. Returned rather than printed so a test can read it.
 *
 * `target` is { region, accountVerified }: every run states which claim it is
 * making about WHERE it looked, because the same names exist in more than one
 * account and an unverified green is not evidence.
 */
export function render(results, held, target) {
  // `held` is used only for the stale-hold notice; each row already carries its
  // own verdict, stamped once by stampHolds.
  const lines = [`\n  Deployed-vs-git drift  (${targetLabel(target)})\n`];
  for (const r of results) {
    if (r.error) {
      lines.push(`  ??  ${r.fn.padEnd(34)} could not check — ${r.error}`);
      continue;
    }
    const vacuous = isVacuous(r);
    const hold = r.held;
    const mark = vacuous ? "VACUOUS" : r.ok ? "OK" : hold ? "HELD" : "DRIFT";
    // The compared count is on EVERY row, not just the empty ones: a number
    // quietly shrinking to one is the same fault caught a release earlier.
    lines.push(`  ${mark.padEnd(7)} ${r.fn.padEnd(34)} ${r.lastModified}  ${r.compared ?? 0} compared`);
    if (vacuous) {
      lines.push(`         NOTHING WAS COMPARED — this row says nothing about ${r.fn}.`);
      lines.push(`         Did the source directory move, or the package layout change?`);
    }
    for (const f of r.drifted) lines.push(`         DIFFERS from git: ${r.dir}/${f}`);
    for (const f of r.extra ?? []) lines.push(`         ONLY IN THE PACKAGE: ${f}`);
    if (r.handlerDrift) {
      lines.push(
        `         ENTRYPOINT: deployed Handler is ${r.handlerDrift.deployed}, ` +
          `the template declares ${r.handlerDrift.declared}`,
      );
    }
    if (r.missing.length) {
      lines.push(`         (not packaged, assumed ops-only: ${r.missing.join(", ")})`);
    }
    if (hold) {
      lines.push(`         HELD ON PURPOSE — do not deploy to clear this.`);
      lines.push(`         why:   ${hold.reason}`);
      lines.push(`         until: ${hold.clearsWhen}`);
    }
  }
  const v = verdict(results, held);
  if (v.unchecked.length) {
    lines.push(
      `\n  ${v.unchecked.length} of ${results.length} functions could NOT be checked. The report above says\n` +
        `  NOTHING about them: their artifacts were never read. That is credentials,\n` +
        `  permissions or the network — not a deploy anyone owes.`,
    );
  }
  if (v.vacuous.length) {
    lines.push(
      `\n  ${v.vacuous.length} of ${results.length} functions compared NOTHING. A zero-file comparison\n` +
        `  cannot match git and cannot differ from it — treat those rows as unchecked.`,
    );
  }
  if (v.bad.length) {
    lines.push(
      `\n  ${v.bad.length} of ${results.length} functions do NOT match git. Deploy them, or explain why not.\n`,
    );
  } else if (v.vacuous.length === 0 && v.unchecked.length === 0) {
    // Only claimable when every row was read AND actually compared something.
    lines.push(
      `\n  All ${v.checked.length - v.held.length} unheld functions match git.` +
        (v.held.length ? ` ${v.held.length} held on purpose (see above).\n` : `\n`),
    );
  }
  for (const h of v.staleHolds) {
    lines.push(
      `  NOTE: the HELD entry matching ${h.fn} no longer matches any drifting function.\n` +
        `        The hold has served its purpose — delete it from scripts/check-lambda-drift.mjs.\n`,
    );
  }
  return lines;
}
