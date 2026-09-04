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
 * Usage:  node scripts/check-device-fleet.mjs      (or: make fleet)
 * Exit:   0 = the table matches the live fleet, or skipped for want of credentials
 *         1 = divergence — the table and Braket disagree in at least one direction
 *         2 = could not check (a region unreadable, or devices.py unparseable)
 *
 * Credentials: read-only, braket:SearchDevices. With none present it prints
 * "SKIPPED" and exits 0, the same skip-cleanly shape .github/workflows/drift.yml uses
 * for an unset role — a check that could not run must not look like a check that
 * passed, but it must not fail a nightly either.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEVICES_PY = join(REPO, "lib", "hardware", "devices.py");

/**
 * Every region Amazon Braket serves (verified 2026-09-04 by calling SearchDevices in
 * each). This is deliberately the FULL set, not just the regions devices.py names:
 * half this check's job is spotting an ONLINE device the repo has never heard of, and
 * a device the repo has never heard of is precisely the one whose region the repo
 * does not list. A repo ARN naming a region absent from this list is treated as
 * "could not check", never as clean — see the guard below.
 *
 * Region-less simulator ARNs (arn:aws:braket:::device/quantum-simulator/amazon/sv1)
 * are returned by SearchDevices in every region that offers them, so one ARN can come
 * back with several statuses; they are folded together in effectiveStatus().
 */
const REGIONS = ["us-east-1", "us-west-1", "us-west-2", "eu-west-2", "eu-north-1"];

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
 *  - any divergence NOT listed here still fails the run.
 *
 * Empty on purpose. Acknowledging a divergence is a decision someone makes in a diff,
 * not the default state.
 *
 * @type {{arn: string, reason: string, clearsWhen: string}[]}
 */
const ACKNOWLEDGED = [];

/** How the fleet reports a device the repo row does not carry an explicit status for. */
const ASSUMED_STATUS = "ONLINE";

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
  const detail =
    String(lastError?.stderr || lastError?.message || lastError)
      .trim()
      .split("\n")
      .filter((l) => l.trim())
      .pop() ?? "unknown error";
  console.error(`  ERROR  could not read DEVICES from ${DEVICES_PY}\n         ${detail}`);
  process.exit(2);
}

/* ---------------------------------------------------------------- live catalog */

/** Are there usable credentials at all? Distinguishes "skip" from "could not check". */
function haveCredentials() {
  try {
    execFileSync("aws", ["sts", "get-caller-identity", "--query", "Account", "--output", "text"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/** Every device Braket lists in one region. Throws with the CLI's own words. */
function searchDevices(region) {
  const out = execFileSync(
    "aws",
    ["braket", "search-devices", "--filters", "[]", "--region", region, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out);
  if (!Array.isArray(parsed.devices)) throw new Error("SearchDevices returned no devices array");
  return parsed.devices;
}

/* --------------------------------------------------------------------- verdict */

/**
 * One status for a device that may be listed in several regions.
 *
 * ONLINE anywhere means the device is reachable, so the repo calling it live is true.
 * Otherwise OFFLINE beats RETIRED: OFFLINE is a reversible calibration window and
 * RETIRED is permanent, and reporting the reversible one keeps the operator from
 * deleting a machine that is coming back.
 */
function effectiveStatus(statuses) {
  if (statuses.includes("ONLINE")) return "ONLINE";
  if (statuses.includes("OFFLINE")) return "OFFLINE";
  if (statuses.length) return statuses[0];
  return "ABSENT";
}

function main() {
  const devices = readRepoDevices();

  // A repo ARN in a region this check does not scan would be compared against nothing
  // and reported clean. Fail closed instead: the fix is one line in REGIONS.
  const unscanned = [];
  for (const [name, spec] of Object.entries(devices)) {
    const region = String(spec.arn ?? "").split(":")[3] ?? "";
    if (region && !REGIONS.includes(region)) unscanned.push(`${name} (${region})`);
  }
  if (unscanned.length) {
    console.error(
      `\n  ERROR  devices.py claims a device in a region this check does not scan:\n` +
        `         ${unscanned.join(", ")}\n` +
        `         Add the region to REGIONS in scripts/check-device-fleet.mjs. Until then\n` +
        `         a retirement there would be invisible, so this refuses to report clean.\n`,
    );
    process.exit(2);
  }

  if (!haveCredentials()) {
    console.error(
      `\n  Braket fleet vs lib/hardware/devices.py\n\n` +
        `  SKIPPED — no AWS credentials in scope, so NOTHING was compared. Braket's live\n` +
        `  device catalog was never read and this run says nothing about whether the\n` +
        `  ${Object.keys(devices).length} rows in devices.py still describe real machines.\n\n` +
        `  Set a profile (AWS_PROFILE=...) or assume a role with braket:SearchDevices,\n` +
        `  then re-run. Exiting 0: a check that could not run must not fail a nightly.\n`,
    );
    process.exit(0);
  }

  /** arn -> { statuses: string[], regions: string[], name, provider } */
  const live = new Map();
  const unreadable = [];
  for (const region of REGIONS) {
    let rows;
    try {
      rows = searchDevices(region);
    } catch (err) {
      const detail = String(err?.stderr || err?.message || err)
        .trim()
        .split("\n")[0];
      unreadable.push({ region, detail });
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

  const scanned = REGIONS.filter((r) => !unreadable.some((u) => u.region === r));
  const ackFor = (arn) => ACKNOWLEDGED.find((a) => a.arn === arn) ?? null;

  const rows = [];
  const bad = [];

  // Direction 1 — every row the repo carries, checked against the live catalog.
  for (const [name, spec] of Object.entries(devices)) {
    const arn = String(spec.arn ?? "");
    const claimed = String(spec.status ?? ASSUMED_STATUS).toUpperCase();
    const entry = live.get(arn);
    const actual = effectiveStatus(entry?.statuses ?? []);
    const where = entry ? entry.regions.join(", ") : "nowhere";
    const ack = ackFor(arn);
    const ok = actual === claimed;
    const row = { kind: "repo", name, arn, claimed, actual, where, ok, ack };
    rows.push(row);
    if (!ok && !ack) bad.push(row);
  }

  // Direction 2 — every ONLINE device the repo has no row for. This is the half no
  // test derived from devices.py can ever produce, because it is about what is NOT
  // in devices.py.
  const known = new Set(Object.values(devices).map((s) => String(s.arn ?? "")));
  for (const [arn, entry] of live) {
    if (known.has(arn)) continue;
    if (effectiveStatus(entry.statuses) !== "ONLINE") continue; // a retired stranger is not news
    const ack = ackFor(arn);
    const onlineIn = entry.regions.filter((_, i) => entry.statuses[i] === "ONLINE");
    const row = {
      kind: "unknown",
      name: `${entry.provider} ${entry.name}`,
      arn,
      claimed: "no row",
      actual: "ONLINE",
      where: onlineIn.join(", "),
      ok: false,
      ack,
    };
    rows.push(row);
    if (!ack) bad.push(row);
  }

  const staleAcks = ACKNOWLEDGED.filter((a) => !rows.some((r) => r.ack && r.arn === a.arn));

  /* ------------------------------------------------------------------- report */

  const out = [];
  out.push(
    `\n  Braket fleet vs lib/hardware/devices.py  ` +
      `(${scanned.length}/${REGIONS.length} regions read, ${new Date().toISOString().slice(0, 10)})\n`,
  );

  for (const r of rows) {
    const mark = r.ok ? "OK" : r.ack ? "ACK" : r.kind === "unknown" ? "UNKNOWN" : "STALE";
    // A repo row is named by its short-name (the thing a learner types); a stranger
    // is named by provider + device name, because it has no short-name to type yet.
    out.push(`  ${mark.padEnd(8)}${r.name.padEnd(26)}${r.arn}`);
    if (r.kind === "unknown") {
      out.push(`          Braket lists this ONLINE in ${r.where}; devices.py has no row for it.`);
    } else if (!r.ok) {
      out.push(
        `          devices.py says ${r.claimed}; Braket says ${r.actual}` +
          (r.where === "nowhere"
            ? ` — the ARN is not returned in any scanned region.`
            : ` (${r.where}).`),
      );
    }
    if (r.ack) {
      out.push(`          ACKNOWLEDGED: ${r.ack.reason}`);
      out.push(`          clears when: ${r.ack.clearsWhen}`);
    }
  }

  for (const u of unreadable) {
    out.push(`  ??      ${u.region.padEnd(26)}could not read — ${u.detail}`);
  }

  if (bad.length) {
    const stale = bad.filter((r) => r.kind === "repo").length;
    const strangers = bad.filter((r) => r.kind === "unknown").length;
    out.push(
      `\n  ${bad.length} divergence(s): ${stale} row(s) the live fleet contradicts, ` +
        `${strangers} ONLINE device(s) the curriculum has never heard of.`,
    );
    out.push(
      `  A STALE row is a dispatch bug: run_circuit prints a cost estimate and submits\n` +
        `  before the service refuses. An UNKNOWN device is curriculum drift — decide\n` +
        `  whether to adopt it, or add it to ACKNOWLEDGED with a reason and a clears-when.\n` +
        `  Reference: 02-hardware/scripts/device_status.py (make devices) prints the same\n` +
        `  live statuses per device.\n`,
    );
  } else if (unreadable.length) {
    out.push(
      `\n  No divergence in the ${scanned.length} region(s) that answered — but ` +
        `${unreadable.length} did not,\n  so this is not a clean bill of health.\n`,
    );
  } else {
    // The acknowledged count is stated rather than folded into the green line: an
    // ACK is a divergence someone chose to live with, and a summary that hides it
    // reads exactly like a fleet with nothing outstanding.
    const acked = rows.filter((r) => r.ack).length;
    out.push(
      `\n  Every unacknowledged row matches the live fleet, and every ONLINE device\n` +
        `  across ${REGIONS.length} regions has a row.` +
        (acked ? ` ${acked} divergence(s) acknowledged on purpose (see above).\n` : `\n`),
    );
  }

  for (const a of staleAcks) {
    out.push(
      `  NOTE: the ACKNOWLEDGED entry for ${a.arn} no longer matches any divergence.\n` +
        `        It has served its purpose — delete it from scripts/check-device-fleet.mjs.\n`,
    );
  }

  console.log(out.join("\n"));

  // Divergence wins over an unreadable region, the same precedence
  // scripts/drift/rules.mjs verdict() uses: "somebody has to act on this" is the
  // actionable half and must not hide behind an infrastructure excuse.
  process.exit(bad.length ? 1 : unreadable.length ? 2 : 0);
}

main();
