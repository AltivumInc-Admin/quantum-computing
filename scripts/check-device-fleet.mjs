#!/usr/bin/env node
/**
 * Does the fleet this repo TEACHES still exist on Amazon Braket?
 *
 * Every other device guard in this repo derives its truth from
 * lib/hardware/devices.py: tests/test_devices.py asserts shot bounds against that
 * table, tests/test_qpu_devices.py asserts the Lambda constants against it,
 * web/__tests__/components/quantum/devices.test.ts asserts the web mirror against
 * the same figures. All of that is internal consistency. None of it can notice that
 * AWS retired a machine, because a retired device blesses itself: the row says it is
 * fine, and every check reads the row.
 *
 * That is not hypothetical. On 2026-09-04 the table still dispatched to TN1, which
 * Braket had RETIRED in all three regions that listed it — run_circuit would print an
 * authoritative dollar estimate and submit before the service refused. It also had
 * never heard of four ONLINE devices (IonQ Forte Enterprise 1, IQM Emerald, AQT
 * IBEX Q1, Rigetti Cepheus-1-108Q). The only thing that can catch either is asking
 * Braket, which is what this does, once a night.
 *
 * BOTH DIRECTIONS, deliberately:
 *   - a device the repo calls live that Braket reports RETIRED or OFFLINE, and
 *   - a device Braket reports ONLINE that the repo has no row for.
 * The second half is the one an internally-consistent test suite can never produce,
 * and it is how the curriculum stays current instead of merely non-broken.
 *
 * WHAT IT DOES NOT DO: it never submits a task, never constructs an AwsDevice, and
 * never touches pricing. SearchDevices is a read of the service catalog. Nothing here
 * is a customer price or a cost basis (rule 6) — device STATUS is the only fact read.
 *
 * NO ACCOUNT PINNING, unlike scripts/check-lambda-drift.mjs and
 * scripts/check-rate-parity.mjs. Those read resources that exist by the same name in
 * more than one account, so a green run that cannot name its account is not evidence.
 * The Braket device catalog is a per-region SERVICE catalog: every account with
 * braket:SearchDevices in a region sees the same devices with the same statuses. So
 * DRIFT_EXPECT_ACCOUNT would pin nothing here, and demanding it would be theatre.
 *
 * THIS FILE IS THE I/O SHELL ONLY. Every decision — which regions could have listed a
 * device, whether a mismatch is a retirement or an unread region, what the exit code
 * is, what the report says — lives in scripts/fleet/rules.mjs, which is pure and
 * covered by scripts/fleet/rules.test.mjs. The split is not tidiness: the cases that
 * matter here (a region that did not answer, a missing `aws`) cannot be rehearsed
 * against the live service on demand, and this check shipped with both of them wrong
 * precisely because there was nothing to rehearse them in.
 *
 * Usage:  node scripts/check-device-fleet.mjs      (or: make fleet)
 * Exit:   0 = the table matches the live fleet, or skipped for want of credentials
 *         1 = divergence — the table and Braket disagree in at least one direction
 *         2 = could not check (a region unreadable, an unusable aws CLI, or a
 *             devices.py that would not parse)
 *
 * Credentials: read-only, braket:SearchDevices. With NO CREDENTIALS AT ALL it prints
 * "SKIPPED" and exits 0, the same skip-cleanly shape .github/workflows/drift.yml uses
 * for an unset role — a check that could not run must not look like a check that
 * passed, but it must not fail a nightly either. A CLI that is missing or broken is a
 * different thing and exits 2, like both siblings in the same nightly do.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  REGIONS,
  classifyAwsFailure,
  evaluate,
  firstLine,
  lastLine,
  render,
  unscannedDevices,
  unusableResponse,
  verdict,
} from "./fleet/rules.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEVICES_PY = join(REPO, "lib", "hardware", "devices.py");

/**
 * Divergences that are KNOWN and deliberately not acted on yet, so a nightly red does
 * not become a red nobody reads — the "cry wolf until someone turns it off" failure
 * scripts/check-lambda-drift.mjs already had to fix once with its HELD list.
 *
 * Same rules as HELD, for the same reasons:
 *  - an entry needs a REASON and a CLEARS-WHEN, both in plain language;
 *  - an acknowledged divergence still PRINTS, as ACK, so it is never invisible;
 *  - if an entry stops matching anything the run says so, because an allowlist
 *    nobody prunes is how a real gap eventually hides;
 *  - any divergence NOT listed here still fails the run;
 *  - and, like a HELD row, an ACK only ever covers a row that was actually READ. A
 *    region that did not answer is not a divergence anyone can acknowledge.
 *
 * Empty on purpose. Acknowledging a divergence is a decision someone makes in a diff,
 * not the default state.
 *
 * @type {{arn: string, reason: string, clearsWhen: string}[]}
 */
const ACKNOWLEDGED = [];

/* ------------------------------------------------------------------ repo table */

// devices.py is parsed with python's own ast + literal_eval rather than imported.
// Importing it would drag in braket.circuits and braket.devices, which is a pip
// install this check does not need and a dependency that can fail for reasons that
// have nothing to do with the fleet. literal_eval also refuses to execute anything,
// so a table with a computed value fails loudly here instead of running code.
const PARSE_DEVICES = `
import ast, json, sys

src = open(sys.argv[1], encoding="utf-8").read()
for node in ast.parse(src).body:
    if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "DEVICES" for t in node.targets):
        print(json.dumps(ast.literal_eval(node.value)))
        break
else:
    raise SystemExit("no literal DEVICES assignment found in " + sys.argv[1])
`;

function readRepoDevices() {
  let lastError;
  for (const python of ["python3", "python"]) {
    try {
      const out = execFileSync(python, ["-c", PARSE_DEVICES, DEVICES_PY], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return JSON.parse(out);
    } catch (err) {
      lastError = err;
    }
  }
  // Python's traceback is mostly frames from ast.py; the last line carries the
  // reason ("malformed node", "no literal DEVICES assignment"), which is the part
  // an operator can act on.
  const detail = lastLine(lastError?.stderr || lastError?.message || lastError) || "unknown error";
  console.error(`  ERROR  could not read DEVICES from ${DEVICES_PY}\n         ${detail}`);
  process.exit(2);
}

/* ---------------------------------------------------------------- live catalog */

/**
 * Can `aws` answer for a caller at all?
 *
 * Returns "ok", or the classification of the failure. The distinction that matters is
 * "there are no credentials in scope" (a fresh clone; skip cleanly) versus "the CLI
 * could not be run" (a broken PATH, a missing binary, a shim exiting 127) — the
 * second used to print SKIPPED and exit 0 inside a CI job that had configured
 * credentials one step earlier, which is a green nightly that compared nothing.
 * classifyAwsFailure() draws the line; see scripts/fleet/rules.mjs.
 */
function callerIdentity() {
  try {
    execFileSync("aws", ["sts", "get-caller-identity", "--query", "Account", "--output", "text"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { kind: "ok", detail: "" };
  } catch (err) {
    return classifyAwsFailure(err);
  }
}

/**
 * Every device Braket lists in one region. Throws with the CLI's own words — and also
 * throws on a SUCCESSFUL response that cannot be believed as a whole catalog (empty, or
 * paginated), because the caller's only two options are "authoritative" and
 * "unreadable", and a partial answer is not the first one. See unusableResponse().
 */
function searchDevices(region) {
  const out = execFileSync(
    "aws",
    ["braket", "search-devices", "--filters", "[]", "--region", region, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out);
  const unusable = unusableResponse(parsed);
  if (unusable) throw new Error(unusable);
  return parsed.devices;
}

/* --------------------------------------------------------------------- verdict */

function main() {
  const devices = readRepoDevices();

  // A repo ARN in a region this check does not scan would be compared against nothing
  // and reported clean. Fail closed instead: the fix is one line in REGIONS.
  const unscanned = unscannedDevices(devices, REGIONS);
  if (unscanned.length) {
    console.error(
      `\n  ERROR  devices.py claims a device in a region this check does not scan:\n` +
        `         ${unscanned.join(", ")}\n` +
        `         Add the region to REGIONS in scripts/fleet/rules.mjs. Until then\n` +
        `         a retirement there would be invisible, so this refuses to report clean.\n`,
    );
    process.exit(2);
  }

  const identity = callerIdentity();
  if (identity.kind === "no-credentials") {
    console.error(
      `\n  Braket fleet vs lib/hardware/devices.py\n\n` +
        `  SKIPPED — no AWS credentials in scope, so NOTHING was compared. Braket's live\n` +
        `  device catalog was never read and this run says nothing about whether the\n` +
        `  ${Object.keys(devices).length} rows in devices.py still describe real machines.\n` +
        `  (aws said: ${identity.detail})\n\n` +
        `  Set a profile (AWS_PROFILE=...) or assume a role with braket:SearchDevices,\n` +
        `  then re-run. Exiting 0: a check that could not run must not fail a nightly.\n`,
    );
    process.exit(0);
  }
  if (identity.kind === "unusable") {
    // NOT a skip. Credentials may well be present; what failed is the tool. Both
    // siblings in this nightly (check-lambda-drift.mjs, check-rate-parity.mjs) exit 2
    // under the identical fault, and a nightly that says SKIPPED here is a job that
    // configured credentials and then compared nothing.
    console.error(
      `\n  ERROR  the aws CLI could not be run, so NOTHING was compared.\n` +
        `         ${identity.detail}\n` +
        `         This is not "no credentials" — it is a missing or broken aws binary.\n` +
        `         Install/repair the CLI (or fix PATH) and re-run. Exiting 2.\n`,
    );
    process.exit(2);
  }

  /** arn -> { statuses: string[], regions: string[], name, provider } */
  const live = new Map();
  const unreadable = [];
  for (const region of REGIONS) {
    let rows;
    try {
      rows = searchDevices(region);
    } catch (err) {
      unreadable.push({ region, detail: firstLine(err?.stderr) || firstLine(err?.message) || "unknown error" });
      continue;
    }
    for (const d of rows) {
      const entry = live.get(d.deviceArn) ?? {
        statuses: [],
        regions: [],
        name: d.deviceName,
        provider: d.providerName,
      };
      entry.statuses.push(d.deviceStatus);
      entry.regions.push(region);
      live.set(d.deviceArn, entry);
    }
  }

  const rows = evaluate({ devices, live, regions: REGIONS, unreadable, acknowledged: ACKNOWLEDGED });
  console.log(render(rows, { regions: REGIONS, unreadable, acknowledged: ACKNOWLEDGED }).join("\n"));

  // Divergence wins over an unreadable region, the same three-way precedence
  // scripts/drift/rules.mjs verdict() uses: "somebody has to act on this" is the
  // actionable half and must not hide behind an infrastructure excuse — but a row
  // nobody could read is the infrastructure excuse, and can only ever produce a 2.
  process.exit(verdict(rows, unreadable, ACKNOWLEDGED).exitCode);
}

main();
