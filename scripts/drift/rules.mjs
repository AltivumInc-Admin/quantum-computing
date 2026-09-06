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
 * Deployed function -> the source it is built from. One entry per function,
 * because several stacks ship more than one function from a single directory.
 *
 * It lives HERE, in the pure module, for one reason: this is a hand-maintained
 * registry — the fourth in this repo, and lambda/analytics/README.md records
 * that lambda/stripe was missed in two of the others for three weeks. A
 * registry needs a guard, and a guard needs to import it without AWS.
 * registryGaps() below compares it to what the templates actually declare.
 *
 * Two optional fields, both carried by exactly one entry today:
 *
 *  - `inline: { template, file }` — the source is not a directory of modules but
 *    a `Code: ZipFile: |` block inside a CloudFormation template, which the
 *    service writes to a single file in the package. See zipFileSource().
 *  - `grantPending: { reason, clearsWhen }` — the DEPLOYED CI policy does not
 *    grant lambda:GetFunction on this function yet, so the nightly run under
 *    quantum-ci-drift-check reads nothing about it. Such a row prints as not
 *    checked, never as OK, and does not fail the run. See verdict().
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
  // The TWELFTH function, and for nine days the only production Lambda nothing
  // compared against git. It is the user pool's PostConfirmation trigger, live in
  // QL-Prod since 2026-08-29, and its source is a `Code: ZipFile: |` block inside
  // infra/workspace/cognito.yaml rather than a directory under lambda/. The
  // registry guard walked `lambda/` only, so nothing ever noticed: the run read
  // eleven functions and printed "All 8 unheld functions match git" while a
  // twelfth ran unwatched.
  //
  // It is exactly the function that most needed watching. From 2026-08-29 to
  // 2026-09-02 every single invocation died at module load — an ESM `import` in a
  // file the runtime loads as CommonJS — so no signup alert was ever sent, and
  // because the handler's whole design is to swallow failures rather than break
  // the sign-up front door, nothing said so. A deployed-vs-git comparison would
  // not have caught THAT bug either (the broken code was faithfully deployed),
  // but a function with that failure mode is the last one to leave unwatched.
  //
  // This entry carried a `grantPending` block from the moment it was registered
  // until 2026-09-06, because a template in git is not a policy in IAM: the CI
  // role could not read this function until infra/github-oidc-drift-role.yaml
  // was redeployed. That deploy landed the same day (one resource, Modify, no
  // replacement), and the proof the block asks for arrived in the next dispatched
  // run: the CI role itself — not an admin profile — read the function and
  // printed "OK quantum-signup-alert … 1 compared". The block is gone, so a drift
  // in this function now fails the run like any other. The mechanism stays
  // (isMissingGrant, clearedGrants, the summary's readable/pending split) for the
  // next function that is registered before its grant is deployed.
  {
    fn: "quantum-signup-alert",
    dir: "infra/workspace",
    inline: { template: "cognito.yaml", file: "index.js" },
  },
];

/**
 * Function names a template DECLARES that this check deliberately does not read,
 * each with a reason and a clears-when.
 *
 * The opposite direction from UNDERIVABLE, and rarer. This check reads ONE
 * account in ONE region (the role's FunctionRegion), so a function this
 * repository declares into a DIFFERENT account is not something a deploy can
 * fix — registering it would produce a permanent "could not check" row, which is
 * the allowlist-nobody-prunes failure in a different costume.
 *
 * Keep it at the length it is, and keep every entry falsifiable: each names
 * where the function actually lives and what would put it back in scope.
 */
export const OUT_OF_SCOPE = [
  {
    fn: "quantumlearner-redirect-canary",
    reason:
      "declared by infra/redirect/quantumlearner-dev.yaml and deployed in the LEGACY Altivum account (verified 2026-09-06: us-east-1, stack quantumlearner-dev-redirect), not in the account this check reads. CLAUDE.md records that stack as genuinely orphaned and removable — which is not the same thing as the vanity DOMAIN and its redirect, which are permanent.",
    clearsWhen:
      "the stack is torn down (then delete this entry and the template), or the redirect is re-created inside the account and region the drift role grants — at which point it belongs in FUNCTIONS instead.",
  },
  {
    fn: "quantum-altivum-ai-redirect-canary",
    reason:
      "declared by infra/redirect/quantum-altivum-ai.yaml, the quantum.altivum.ai redirect's uptime canary. Searched 2026-09-06 and found in NO account this session can reach — not QL-Prod (us-east-2, us-east-1, us-west-2, eu-north-1) and not Altivum (us-east-1, us-east-2) — so the template is ahead of any deployment, and it certainly is not in the one region the drift role grants.",
    clearsWhen:
      "it is deployed into the account and region the drift role grants (move it to FUNCTIONS), or the template is deleted along with the redirect it monitors.",
  },
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
 * The bytes a `Code: ZipFile: |` block becomes once CloudFormation writes it out,
 * or null if this text carries no such block in a form that can be reproduced.
 *
 * This is the whole of the "normalisation" the inline comparison needs, and it is
 * not a heuristic: it is YAML's own literal block scalar, undone. The indentation
 * is taken from the FIRST non-empty line (which is what YAML does — NOT the
 * marker's indent plus two, which would leave stray leading spaces on every line
 * of a body indented by four and produce a confident, wrong diff), a line
 * indented further keeps its extra spaces, and clip chomping means trailing empty
 * lines are dropped and exactly one newline is kept.
 *
 * ONLY a bare `|` is accepted. `|-`, `|+`, `|2`, `>` and `!Sub |` each produce
 * different bytes, so returning "the body" for them would be a comparison of the
 * wrong thing — the false green this whole file exists to prevent. They return
 * null instead, which the caller must report as unreadable rather than as a
 * match; scripts/drift/registry.test.mjs pins that the real template still parses,
 * so a rewrite fails in CI with no AWS involved rather than at 13:00 UTC.
 *
 * Verified against reality on 2026-09-06: the block in infra/workspace/cognito.yaml
 * run through this function is byte-identical (sha256) to index.js inside the
 * package quantum-signup-alert is actually running in QL-Prod.
 */
export function zipFileSource(text) {
  const lines = String(text).split("\n");
  const at = lines.findIndex((l) => /^ *ZipFile: \|$/.test(l));
  if (at === -1) return null;
  const indentOf = (l) => l.length - l.replace(/^ +/, "").length;
  const markerIndent = indentOf(lines[at]);
  const body = [];
  let indent = null;
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    // A blank line is part of the block wherever it appears; it never ends one and
    // it never sets the indentation. But "blank" is not the same as "empty": YAML
    // strips exactly `indent` characters, so a whitespace-only line INDENTED PAST
    // the block indent keeps the extra spaces as content. Pushing "" for it drops
    // bytes the deployed artifact has, and the comparison then reports DRIFT on a
    // handler nobody touched — the confident, wrong diff this function's docstring
    // says it exists to prevent. Checked against a real parser: PyYAML on a body
    // line of six spaces under a four-space block yields " ", not "".
    //
    // Before the indent is known, a blank line cannot be measured against it yet,
    // so it contributes "" — which is correct, because YAML takes the indent from
    // the first NON-empty line and any blank line above that one is empty content.
    if (line.trim() === "") {
      body.push(indent === null ? "" : line.slice(indent));
      continue;
    }
    if (indent === null) {
      if (indentOf(line) <= markerIndent) return null; // an empty block scalar
      indent = indentOf(line);
    } else if (indentOf(line) < indent) {
      break;
    }
    body.push(line.slice(indent));
  }
  while (body.length && body[body.length - 1] === "") body.pop();
  return body.length ? body.join("\n") + "\n" : null;
}

/**
 * Every function a CloudFormation template declares with a LITERAL name, the
 * entry point it declares for it, and its inline source if it has one.
 *
 * Split on top-level resource keys so a Handler — and a ZipFile body — is
 * attributed to the function in its own block and not to a neighbour's.
 *
 * The name is any literal, not just `quantum-*`. It was `quantum-[...]` until
 * 2026-09-06, which meant `quantumlearner-redirect-canary` (a real Lambda, in a
 * real stack, declared in this repository) matched nothing and was invisible to
 * the registry guard by accident rather than by decision. A blind spot that
 * nobody chose is the kind this file exists to remove: every literal is seen now,
 * and anything deliberately not read is written down in OUT_OF_SCOPE with a
 * reason. `!Ref`/`!GetAtt`/`!Sub` values still do not match — they start with
 * `!`, not a letter — so an AWS::Lambda::Permission is not a declaration.
 */
export function declaredFunctions(template) {
  const declared = [];
  for (const block of String(template).split(/^ {2}(?=[A-Za-z0-9]+: *$)/m)) {
    const fn = block.match(/^ *FunctionName: *([A-Za-z][A-Za-z0-9-]*) *$/m)?.[1];
    if (!fn) continue;
    declared.push({
      fn,
      handler: block.match(/^ *Handler: *(\S+) *$/m)?.[1],
      inline: zipFileSource(block),
    });
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
 *
 * Each direction has ONE escape hatch, and both cost a written reason:
 * `underivable` excuses a registered name no template spells out, `outOfScope`
 * excuses a declared name this check deliberately never reads.
 */
export function registryGaps(declared, registered, underivable = UNDERIVABLE, outOfScope = OUT_OF_SCOPE) {
  const excused = new Set(underivable.map((u) => u.fn));
  const elsewhere = new Set(outOfScope.map((o) => o.fn));
  const byName = new Map(registered.map((r) => [r.fn, r]));
  const unregistered = declared.filter((d) => !byName.has(d.fn) && !elsewhere.has(d.fn));
  const underived = registered.filter((r) => !excused.has(r.fn) && !declared.some((d) => d.fn === r.fn));
  const misdirected = declared
    .filter((d) => byName.has(d.fn) && byName.get(d.fn).dir !== d.dir)
    .map((d) => ({ fn: d.fn, declaredIn: d.dir, registeredAs: byName.get(d.fn).dir }));
  return { unregistered, underived, misdirected };
}

/**
 * Strip anything from text bound for a public log that does not belong there.
 *
 * TWO shapes, both learned from a real leak rather than imagined:
 *
 * execFileSync's thrown message is literally "Command failed: " + the whole
 * argv, and the argv of the download step carries the PRESIGNED package URL —
 * X-Amz-Signature and X-Amz-Security-Token included — which would grant an
 * anonymous reader of a public Actions log the production deployment package
 * for the URL's validity window.
 *
 * And an AWS authorization failure names the CALLER in full: "User:
 * arn:aws:sts::<account>:assumed-role/... is not authorized to perform ...".
 * Every row here reports the child's own stderr, so an AccessDenied prints the
 * account id straight into a world-readable log for a repository whose whole
 * convention is that account numbers live in deployed configuration and private
 * notes, never in version control. That was a once-in-a-while risk until a
 * function was registered whose grant is not deployed yet: an expected
 * AccessDenied every single night is a scheduled disclosure. Twelve consecutive
 * digits is the shape, and nothing this check legitimately reports has it.
 *
 * Redacting by SHAPE, rather than by knowing which call is risky, is what keeps
 * a future subprocess from regressing either one.
 */
export const redact = (text) =>
  String(text ?? "")
    .replace(/https?:\/\/\S+/g, "<url redacted>")
    .replace(/\b\d{12}\b/g, "<account>");

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

/**
 * Is this row's failure the MISSING READ GRANT its grantPending declares, and
 * nothing else?
 *
 * grantPending used to ride on the row, which meant it excused every read
 * failure for that function rather than the one it was written for. Observed,
 * not theorised: with the grant absent, a ResourceNotFoundException for
 * quantum-signup-alert printed "the CI role has no read grant for this function
 * yet" and exited 0 — so during the pending window the check could not report
 * that a live PostConfirmation trigger had been DELETED. That is the exact
 * false-all-clear this whole change exists to remove, reintroduced one row down.
 *
 * So the excuse is now conditioned on the error text as well. Anything else —
 * the function is gone, the region is wrong, the zip would not fetch — is a real
 * could-not-check and reddens the run like any other.
 */
export const isMissingGrant = (r) =>
  Boolean(r.grantPending) && /AccessDenied|not authorized to perform/i.test(String(r.error ?? ""));

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
 * A row that carries a grantPending declaration and was nevertheless READ.
 *
 * The counterpart to staleHolds, and deliberately more careful about what it
 * claims. A hold goes stale when the drift it excuses disappears, which any run
 * can see. A pending GRANT is about the CI role's policy, and a run under an
 * administrative profile (which is what `make drift` uses locally) reads the
 * function whether or not that policy has been deployed — so a successful read
 * is evidence only when the reader WAS the CI role. render() says exactly that
 * rather than instructing anyone to delete something on ambiguous evidence.
 */
export const clearedGrants = (results) => results.filter((r) => r.grantPending && !r.error);

/** A row that declares a pending grant but failed for some OTHER reason. */
export const misattributedGrant = (results) =>
  results.filter((r) => r.grantPending && r.error && !isMissingGrant(r));

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
  // `unchecked` splits the same way `bad` splits into DRIFT and HELD, and for the
  // same reason: a declared, expected instance of the condition is not an
  // incident. A function whose read grant is not in the deployed CI policy yet
  // cannot be read by the nightly job, and it will be unreadable every night
  // until an IAM change is deployed — which is a different person's action on a
  // different stack, so reddening the job for everyone in the meantime is how a
  // check gets muted. It still prints, and it still suppresses the all-clear
  // line, so it can never be mistaken for a function that matched.
  // isMissingGrant, NOT r.grantPending: the declaration says which function is
  // expected to be unreadable, the error text says whether THIS failure is that
  // expectation. A row that declares a pending grant and then fails for any other
  // reason belongs in `blocked`, where it reddens the run.
  const pending = unchecked.filter(isMissingGrant);
  const blocked = unchecked.filter((r) => !isMissingGrant(r));
  // Drift and could-not-check are accumulated SEPARATELY: one Math.max let an
  // unrelated credentials failure promote a real drift exit of 1 to 2, and one
  // plain assignment let a later clean row demote a 2 to 1. Drift wins, because
  // "somebody owes a deploy" is the actionable half and must not be hidden
  // behind an infrastructure excuse.
  const drifted = bad.length > 0 || vacuous.length > 0;
  const exitCode = drifted ? 1 : blocked.length ? 2 : 0;
  return {
    exitCode,
    bad,
    vacuous,
    unchecked,
    pending,
    blocked,
    checked,
    held: heldRows,
    staleHolds: staleHolds(held, results),
    clearedGrants: clearedGrants(results),
  };
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
      // isMissingGrant, not r.grantPending. A row can declare a pending grant and
      // then fail for a completely different reason — the function deleted, the
      // region wrong — and printing "the CI role has no read grant for this
      // function yet" there is an explanation that is affirmatively FALSE about
      // the cause, attached to a real incident. Observed before this guard: a
      // ResourceNotFoundException on the live PostConfirmation trigger printed
      // exactly that. Such a row now falls through to the plain "?? could not
      // check" line and reddens the run.
      if (isMissingGrant(r)) {
        // Said in full, on the row, because "??" alone reads as an incident and
        // this one is a known state with a named owner. What must never happen
        // here is the row reading as OK — so the wording claims nothing about
        // whether the function matches git, and the summary below withholds the
        // all-clear line for exactly as long as this row exists.
        lines.push(`         NOT CHECKED, AND EXPECTED — the CI role has no read grant for this`);
        lines.push(`         function yet. This run says NOTHING about ${r.fn};`);
        lines.push(`         it is not drift, and no deploy of the FUNCTION is owed.`);
        lines.push(`         why:   ${r.grantPending.reason}`);
        lines.push(`         until: ${r.grantPending.clearsWhen}`);
      }
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
    // Where to LOOK, which for an inline function is not a file that exists.
    // "DIFFERS from git: infra/workspace/index.js" sends the reader to a path
    // with nothing at it; the source is a block inside the stack template, and
    // the fix is a stack deploy rather than a function deploy.
    const where = (f) =>
      r.inline ? `${r.dir}/${r.inline.template} — the ZipFile block deployed as ${f}` : `${r.dir}/${f}`;
    for (const f of r.drifted) lines.push(`         DIFFERS from git: ${where(f)}`);
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
  if (v.blocked.length) {
    lines.push(
      `\n  ${v.blocked.length} of ${results.length} functions could NOT be checked. The report above says\n` +
        `  NOTHING about them: their artifacts were never read. That is credentials,\n` +
        `  permissions or the network — not a deploy anyone owes.`,
    );
  }
  if (v.pending.length) {
    // The positive claim is stated HERE rather than by the all-clear line below,
    // which stays suppressed: "All N unheld functions match git" must never be
    // printed in a run that never opened one of the functions.
    lines.push(
      `\n  ${v.pending.length} of ${results.length} functions were NOT READ because the CI role's grant for\n` +
        `  them is not deployed yet (see the rows above). This run makes no claim about\n` +
        `  those, and does not fail on them — the outstanding action is an IAM deploy,\n` +
        `  not a function deploy.\n` +
        `  Of the ${v.checked.length} it did read, ${v.checked.length - v.held.length - v.bad.length - v.vacuous.length} unheld match git` +
        (v.held.length ? ` and ${v.held.length} are held on purpose.` : `.`),
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
    // `unchecked`, not `blocked`: a row whose CI grant is merely pending was
    // still never read, and this sentence is the one a reader takes at face
    // value. The pending block above makes the narrower, true claim instead.
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
  for (const r of v.clearedGrants) {
    // Deliberately conditional. An administrative profile reads this function
    // whether or not the CI policy has been deployed, so a successful read here
    // is not by itself evidence that the grant landed — and telling someone to
    // delete the declaration on that evidence would silently re-red the nightly
    // job for everyone.
    lines.push(
      `  NOTE: ${r.fn} carries a grantPending declaration and WAS read by this run.\n` +
        `        If this run used the CI role (quantum-ci-drift-check), the grant has landed:\n` +
        `        delete grantPending from its FUNCTIONS entry in scripts/drift/rules.mjs.\n` +
        `        A run under an administrative profile reads it either way and proves nothing.\n`,
    );
  }
  return lines;
}
