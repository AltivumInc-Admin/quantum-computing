#!/usr/bin/env node
/**
 * Is what's RUNNING what's in git?
 *
 * On 2026-08-04 the deployed billing Lambda was found to be eight days and three merged
 * PRs behind `main` — 150 lines of payment logic, including debt-clearing and refund
 * receipts, that had passed CI, been reviewed, been merged, and never shipped. Nothing
 * surfaced it. CI was green. The PRs were closed. The CloudFormation stack read
 * UPDATE_COMPLETE — from the PREVIOUS deploy. A stack in UPDATE_COMPLETE tells you a
 * deploy once succeeded, not that it shipped current code.
 *
 * The only thing that surfaces this is downloading the artifact and reading it. That is
 * what this does, for every function, so the gap is visible the day it appears.
 *
 * One control-plane call per function, then the package. If the download ever needs to
 * cost less, the same response already carries Configuration.CodeSha256: recording it
 * per function would let an unchanged package skip the fetch entirely. Not done, because
 * a cache that is wrong is exactly the false green this file exists to catch — the sha
 * would have to be stored somewhere as trustworthy as the artifact itself.
 *
 * Compares hand-written source only — node_modules and build metadata legitimately
 * differ between a packaged artifact and a working tree, and comparing them would make
 * this cry wolf until someone turned it off. Within that set the comparison runs BOTH
 * ways (a module shipped that git never had is drift too), and the deployed Handler is
 * compared to the template's, because a repointed entry point changes what executes
 * while leaving every compared byte identical.
 *
 * "Hand-written source" is USUALLY a directory under lambda/, and for one function it is
 * a `Code: ZipFile: |` block inside a CloudFormation template. Both are compared the same
 * way; only where the git side comes from differs (see gitSource below). That function —
 * quantum-signup-alert, the user pool's PostConfirmation trigger — was outside this check
 * entirely until 2026-09-06, because the registry guard walked lambda/ and never opened
 * infra/. It is the one that most needed to be inside it: it swallows its own failures by
 * design so a broken notifier can never break the sign-up front door, so when every
 * invocation died at module load for four days in August, nothing at all said so.
 *
 * Usage:  node scripts/check-lambda-drift.mjs [--json]
 * Exit:   0 = every function matches git   1 = drift found   2 = could not check
 *
 * Set DRIFT_EXPECT_ACCOUNT to the account this report is meant to describe — every
 * function name below exists in more than one, and an unverified green says nothing
 * about which one answered. Unset is allowed and prints as "account unverified".
 *
 * Needs AWS read access (lambda:GetFunction). It runs daily in GitHub Actions under
 * the read-only quantum-ci-drift-check role (.github/workflows/drift.yml,
 * infra/github-oidc-drift-role.yaml), and locally via `make drift` wherever credentials
 * exist.
 *
 * This file is the I/O SHELL. Everything decidable without AWS — the source filter,
 * the HELD matching, the stale-hold rule, the exit-code policy and the report text —
 * lives in scripts/drift/rules.mjs, where scripts/drift/rules.test.mjs exercises it
 * with no credentials and no network.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { accountCheck } from "./drift/account.mjs";
import {
  FUNCTIONS,
  declaredFunctions,
  failureReason,
  handlerMismatch,
  render,
  sourceFiles as filterSources,
  stampHolds,
  verdict,
} from "./drift/rules.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const REGION = process.env.AWS_REGION || "us-east-2";
const JSON_OUT = process.argv.includes("--json");

/**
 * Functions whose drift is DELIBERATE, with the reason and who to ask.
 *
 * Without this, a hold has nowhere to live except someone's head: the check
 * goes red, stays red, and by day three nobody reads it — the "cry wolf until
 * someone turns it off" failure this script's own header warns about. It had
 * already happened once (four consecutive red daily runs, 2026-08-29..09-01)
 * before this existed.
 *
 * Rules that keep this from becoming the rot it prevents:
 *  - A hold needs a REASON and a CLEARS-WHEN, both in plain language.
 *  - A held function still prints, as HELD, so it is never invisible.
 *  - If a held function STOPS drifting, this file is stale and the run says so
 *    — an allowlist nobody prunes eventually hides a real gap.
 *  - Drift in anything NOT listed here still fails the run, exactly as before.
 */
const HELD = [
  {
    fn: /^quantum-review-email-/,
    reason:
      "Cosmetic email recolor (black-and-gold retheme) is merged but deliberately NOT deployed: the three product sessions agreed to run no unrelated production deploys during the Shop product's domain cutover, so a Shop incident is never debugged alongside a Learner deploy.",
    clearsWhen:
      "Shop's cutover completes — the platform session coordinates it (runbook: docs/platform-subdomain-migration.md in the quantum-env repo). Then deploy lambda/review-email and DELETE this entry.",
  },
];

// stderr is CAPTURED, not inherited: it is the diagnostic the row reports, and
// capturing it means nothing a child writes reaches a public log unredacted.
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    // A hung child would otherwise hang the whole daily job silently; the job
    // itself carries a timeout too, but a per-call one names WHICH call hung.
    timeout: 180_000,
    ...opts,
  }).trim();

/**
 * One retry for the control-plane calls. A throttle or a blip on one of the
 * twenty-odd API calls this run makes should not read as "could not check" for
 * the whole function — and the second failure still throws, with its stderr.
 */
const shRetry = (cmd, args, opts) => {
  try {
    return sh(cmd, args, opts);
  } catch {
    return sh(cmd, args, opts);
  }
};

/** Hand-written source in a directory: the pure filter, applied to what is on disk. */
const sourceFiles = (dir) => {
  if (!existsSync(dir)) return [];
  return filterSources(readdirSync(dir)).filter((f) => statSync(join(dir, f)).isFile());
};

/** Every template a registered function is built from, deduplicated. */
const TEMPLATE_PATHS = [
  ...new Set(FUNCTIONS.map((f) => join(REPO, f.dir, f.inline?.template ?? "template.yaml"))),
].filter((path) => existsSync(path));

/**
 * Entry point each function's template declares, by function name.
 *
 * Read from the working tree, compared against the deployed Handler below.
 * lambda/stripe names its function through a parameter, so it contributes
 * nothing here and its rows carry no entry-point claim (see UNDERIVABLE).
 */
const DECLARED_HANDLERS = new Map(
  TEMPLATE_PATHS.flatMap((path) => declaredFunctions(readFileSync(path, "utf8"))).map((d) => [d.fn, d.handler]),
);

/**
 * The GIT side of one function, as filename -> contents.
 *
 * Two shapes, because two functions are built two ways. Most are a directory of
 * hand-written modules under lambda/. quantum-signup-alert is a `Code: ZipFile: |`
 * block inside a CloudFormation template, which the service writes to a single
 * index.js — so its git side is one entry whose contents come from undoing the
 * YAML block scalar (zipFileSource), not from a file on disk.
 *
 * That normalisation is exact rather than approximate, and it was verified against
 * the running artifact before this path was written: the dedented block and the
 * index.js inside the package quantum-signup-alert is actually running in QL-Prod
 * hash identically. It is not a fuzzy comparison and it must never become one — if
 * the block is ever rewritten in a form zipFileSource cannot reproduce byte for
 * byte it returns null, and this throws rather than comparing the wrong bytes.
 */
const gitSource = ({ fn, dir, inline }) => {
  const srcDir = join(REPO, dir);
  if (!inline) return new Map(sourceFiles(srcDir).map((f) => [f, readFileSync(join(srcDir, f), "utf8")]));
  // Matched by function NAME, not by "the first block that has one": a template
  // may carry several inline functions, and attributing one function's source to
  // another would compare two real files and call the mismatch drift.
  const declared = declaredFunctions(readFileSync(join(srcDir, inline.template), "utf8")).find((d) => d.fn === fn);
  if (!declared) throw new Error(`${dir}/${inline.template} no longer declares ${fn}`);
  if (!declared.inline) {
    throw new Error(`${fn}'s ZipFile block in ${dir}/${inline.template} is not a reproducible \`|\` literal`);
  }
  return new Map([[inline.file, declared.inline]]);
};

// WHICH account is this report about? The names below exist in more than one,
// and the answer comes from ambient credentials — so the expectation is stated
// in the environment and checked before a single function is read. Value-blind:
// the ids are compared, never printed (scripts/drift/account.mjs).
const expectAccount = process.env.DRIFT_EXPECT_ACCOUNT;
let callerAccount;
if (expectAccount) {
  try {
    callerAccount = sh("aws", ["sts", "get-caller-identity", "--query", "Account", "--output", "text"]);
  } catch {
    console.error("  ERROR  could not resolve the caller's account (sts get-caller-identity failed).");
    process.exit(2);
  }
}
const identity = accountCheck(expectAccount, callerAccount);
// stderr, so --json stays machine-readable.
for (const line of identity.lines) console.error(line);
if (identity.refuse) process.exit(2);

const results = [];

for (const entry of FUNCTIONS) {
  const { fn, dir, inline, grantPending } = entry;
  let tmp;
  // Which step failed, for the row's message when one does. The child's stderr
  // is preferred over its message; this is the fallback (see failureReason).
  let stage = "aws lambda get-function failed";
  try {
    // ONE control-plane call per function. get-function already returns the
    // configuration, so asking for LastModified and Handler separately was a
    // second round trip for fields the first response carried — one per function
    // per run, every morning. --output text prints the three tab-separated.
    const [url, lastModified, deployedHandler] = shRetry("aws", ["lambda", "get-function",
      "--function-name", fn, "--region", REGION,
      "--query", "[Code.Location,Configuration.LastModified,Configuration.Handler]",
      "--output", "text"]).split(/\s+/);
    tmp = mkdtempSync(join(tmpdir(), `drift-${fn}-`));
    // The presigned URL goes to curl on STDIN, never in argv: argv is what
    // execFileSync echoes into its thrown message, and it is also what `ps`
    // shows any other user on a shared host. `fail` turns an S3 error body into
    // an honest failure instead of an HTML file that unzip then chokes on.
    stage = "download failed";
    sh("curl", ["--config", "-"], {
      input: [
        `url = "${url}"`,
        `output = "${join(tmp, "fn.zip")}"`,
        "silent",
        "show-error",
        "fail",
        "retry = 3",
        "retry-all-errors",
        "max-time = 120",
        "",
      ].join("\n"),
    });
    stage = "unzip failed";
    sh("unzip", ["-oq", join(tmp, "fn.zip"), "-d", join(tmp, "fn")]);

    // Read AFTER the package, so a template that stopped yielding a comparable
    // ZipFile block reports as a could-not-check row with its own reason rather
    // than aborting the loop.
    stage = "could not read the git side";
    const git = gitSource(entry);
    const drifted = [];
    const missing = [];
    let compared = 0;
    for (const [file, a] of git) {
      const deployedPath = join(tmp, "fn", file);
      if (!existsSync(deployedPath)) { missing.push(file); continue; }
      const b = readFileSync(deployedPath, "utf8");
      compared += 1;
      if (a !== b) drifted.push(file);
    }

    // The comparison runs BOTH ways. Walking only the working-tree side means a
    // top-level module that ships in the package and exists nowhere in the
    // repository — a leftover, a hand-edited file, a build artifact — is never
    // looked at, and the run still reports the function as matching.
    // For an inline function this is also the check that the ZipFile block is the
    // WHOLE package: a second module shipped beside index.js has no counterpart
    // in the template and shows up here rather than passing unseen.
    const extra = sourceFiles(join(tmp, "fn")).filter((f) => !git.has(f));

    const handlerDrift = handlerMismatch(deployedHandler, DECLARED_HANDLERS.get(fn));

    // Only a file present in BOTH and differing is drift. A file that exists in git but
    // not in the package is almost always an ops script that was never meant to ship
    // (deploy-check.mjs, cfn-slice.mjs, backfill-*.mjs), and failing on those would make
    // this cry wolf until someone disabled it — which is how guards die.
    // A zero-file comparison is not a match: "nothing differed" is trivially true
    // of nothing. `compared` is what makes the difference visible, here and on
    // every printed row.
    const ok = compared > 0 && drifted.length === 0 && extra.length === 0 && !handlerDrift;
    // grantPending rides on BOTH shapes of row on purpose. On the error row it is
    // what stops an expected AccessDenied from reddening the nightly job; on the
    // success row it is what lets the report notice the declaration has outlived
    // its cause (see clearedGrants).
    results.push({ fn, dir, inline, grantPending, ok, compared, drifted, extra, missing, handlerDrift, lastModified });
  } catch (err) {
    results.push({ fn, dir, inline, grantPending, ok: false, error: failureReason(err, stage) });
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

// A DECLARED hold does not fail the run — it prints as HELD with its reason.
// Undeclared drift still fails, which is the whole point of the check. Stamped
// ONCE here, so the printer, both summary lists and the --json payload report
// the same verdict instead of each re-deriving it.
const stamped = stampHolds(results, HELD);
const { exitCode, staleHolds, pending, clearedGrants } = verdict(stamped, HELD);

if (JSON_OUT) {
  // The JSON says everything the human report says: which rows are held and
  // why, which holds have gone stale, and what the process is about to exit
  // with. It used to carry only ok:false, which a reader could not tell from
  // real drift. `notRead` is here for the same reason: exitCode 0 with a
  // function nobody opened is a claim a machine reader must be able to see.
  console.log(
    JSON.stringify(
      {
        region: REGION,
        accountVerified: identity.verified,
        exitCode,
        staleHolds: staleHolds.map((h) => ({
          pattern: String(h.fn),
          reason: h.reason,
          clearsWhen: h.clearsWhen,
        })),
        notRead: pending.map((r) => r.fn),
        clearedGrants: clearedGrants.map((r) => r.fn),
        results: stamped,
      },
      null,
      2,
    ),
  );
} else {
  for (const line of render(stamped, HELD, { region: REGION, accountVerified: identity.verified })) {
    console.log(line);
  }
}

process.exit(exitCode);
