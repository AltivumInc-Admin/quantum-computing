/**
 * The fleet check's rules, exercised with no AWS, no network and no node_modules.
 *
 * These are the cases a live run cannot rehearse on demand — a region that did not
 * answer, every region that did not answer, an `aws` binary that is not there — and
 * they are the ones that decide whether a red morning means "AWS retired a machine and
 * the curriculum dispatches to it" or "eu-north-1 threw an AccessDenied". The check
 * shipped conflating exactly those two, and nothing existed to catch it because the
 * decision logic was not extractable. This is that verification, repeatable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  REGIONS,
  arnRegion,
  classifyAwsFailure,
  coverage,
  effectiveStatus,
  evaluate,
  lastLine,
  render,
  unscannedDevices,
  unusableResponse,
  verdict,
} from "./rules.mjs";

/* ------------------------------------------------------------------- fixtures */

const GARNET = "arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet";
const EMERALD = "arn:aws:braket:eu-north-1::device/qpu/iqm/Emerald";
const FORTE = "arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1";
const SV1 = "arn:aws:braket:::device/quantum-simulator/amazon/sv1";
const TN1 = "arn:aws:braket:::device/quantum-simulator/amazon/tn1";
const CEPHEUS = "arn:aws:braket:us-west-1::device/qpu/rigetti/Cepheus-1-108Q";

/** A small stand-in for the DEVICES table, with the shapes that matter. */
const DEVICES = {
  sv1: { arn: SV1, status: "ONLINE" },
  tn1: { arn: TN1, status: "RETIRED" },
  ionq_forte: { arn: FORTE, status: "OFFLINE" },
  iqm_garnet: { arn: GARNET, status: "ONLINE" },
  iqm_emerald: { arn: EMERALD, status: "ONLINE" },
};

/** The live catalog as SearchDevices would report it with every region answering. */
function fullCatalog(overrides = {}) {
  const live = new Map([
    [SV1, { statuses: ["ONLINE", "ONLINE", "ONLINE"], regions: ["us-east-1", "us-west-2", "eu-west-2"], name: "SV1", provider: "Amazon Braket" }],
    [TN1, { statuses: ["RETIRED", "RETIRED"], regions: ["us-east-1", "us-west-2"], name: "TN1", provider: "Amazon Braket" }],
    [FORTE, { statuses: ["OFFLINE"], regions: ["us-east-1"], name: "Forte 1", provider: "IonQ" }],
    [GARNET, { statuses: ["ONLINE"], regions: ["eu-north-1"], name: "Garnet", provider: "IQM" }],
    [EMERALD, { statuses: ["ONLINE"], regions: ["eu-north-1"], name: "Emerald", provider: "IQM" }],
  ]);
  for (const [arn, entry] of Object.entries(overrides)) {
    if (entry === null) live.delete(arn);
    else live.set(arn, entry);
  }
  return live;
}

/** Drop every device a region contributed, as an unreadable region really would. */
function withoutRegion(live, region) {
  const out = new Map();
  for (const [arn, entry] of live) {
    const keep = entry.regions.map((r, i) => [r, entry.statuses[i]]).filter(([r]) => r !== region);
    if (!keep.length) continue;
    out.set(arn, { ...entry, regions: keep.map(([r]) => r), statuses: keep.map(([, s]) => s) });
  }
  return out;
}

const run = (args) => {
  const rows = evaluate(args);
  const v = verdict(rows, args.unreadable ?? [], args.acknowledged ?? []);
  const out = render(rows, { ...args, date: "2026-09-05" }).join("\n");
  return { rows, ...v, out, state: (name) => rows.find((r) => r.name === name)?.state };
};

/* --------------------------------------------------------------- happy path */

test("the happy path: every row matches and no stranger is ONLINE", () => {
  const r = run({ devices: DEVICES, live: fullCatalog(), regions: REGIONS });
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.bad, []);
  assert.deepEqual(r.unchecked, []);
  assert.equal(r.rows.every((row) => row.state === "OK"), true);
  assert.match(r.out, /Every unacknowledged row matches the live fleet/);
  assert.match(r.out, /5\/5 regions read/);
});

/* ------------------------------------------------------- the vacuity defects */

test("PARTIAL OUTAGE: one unreadable region reports UNREAD rows, never retirements", () => {
  // The defect this file exists for. eu-north-1 is the only region that can list
  // Garnet or Emerald, and Garnet is the single QPU lambda/qpu is fenced to. Before
  // the three-way partition this run printed "STALE iqm_garnet / iqm_emerald",
  // "divergence(s)", exit 1, and the workflow told the operator to edit devices.py.
  const unreadable = [{ region: "eu-north-1", detail: "AccessDeniedException: not authorized to perform braket:SearchDevices" }];
  const r = run({
    devices: DEVICES,
    live: withoutRegion(fullCatalog(), "eu-north-1"),
    regions: REGIONS,
    unreadable,
  });

  assert.equal(r.exitCode, 2, "an outage is could-not-check, never divergence");
  assert.deepEqual(r.bad, [], "nothing may be reported as a divergence");
  assert.deepEqual(r.unchecked.map((row) => row.name).sort(), ["iqm_emerald", "iqm_garnet"]);
  // The regions that DID answer are still checked — an outage must not blind the rest.
  assert.equal(r.state("sv1"), "OK");
  assert.equal(r.state("tn1"), "OK");
  assert.equal(r.state("ionq_forte"), "OK");

  assert.match(r.out, /could not read — AccessDeniedException/);
  assert.match(r.out, /UNCHECKED iqm_garnet/);
  assert.match(r.out, /NOT CHECKED — eu-north-1 did not answer, and it is the only region/);
  assert.match(r.out, /Do NOT edit lib\/hardware\/devices\.py on the strength of this run/);
  assert.doesNotMatch(r.out, /STALE/);
  assert.doesNotMatch(r.out, /divergence\(s\):/);
});

test("FULL OUTAGE: no region readable is exit 2 with zero divergences", () => {
  const unreadable = REGIONS.map((region) => ({ region, detail: "AccessDeniedException" }));
  const r = run({ devices: DEVICES, live: new Map(), regions: REGIONS, unreadable });

  assert.equal(r.exitCode, 2);
  assert.deepEqual(r.bad, []);
  assert.equal(r.unchecked.length, Object.keys(DEVICES).length, "every row is unread, none is stale");
  assert.match(r.out, /0\/5 regions read/);
  // The region-less simulators can be listed by any region, so all five are named.
  assert.match(r.out, /NOT CHECKED — no region that could list this ARN answered/);
  assert.match(r.out, /\(us-east-1, us-west-1, us-west-2, eu-west-2, eu-north-1; the ARN names no region/);
  assert.doesNotMatch(r.out, /STALE/);
});

/* ------------------------------------ a SUCCESSFUL answer that means nothing */

test("a region that answers 200 with an EMPTY catalog is unreadable, never authoritative", () => {
  // The same defect as the partial outage, reached through a success. A region was
  // counted as scanned the moment the CLI exited 0 and the JSON carried a devices
  // array; nothing asked whether the array was plausible. An HTTP-200 `{"devices": []}`
  // from eu-north-1 alone printed "(5/5 regions read)" — asserting FULL coverage — then
  // STALE iqm_garnet / iqm_emerald, "divergence(s)", exit 1, and the workflow told the
  // operator to edit devices.py. Garnet is the only QPU lambda/qpu is fenced to.
  const detail = unusableResponse({ devices: [] });
  assert.match(detail, /empty catalog/);

  const r = run({
    devices: DEVICES,
    live: withoutRegion(fullCatalog(), "eu-north-1"),
    regions: REGIONS,
    unreadable: [{ region: "eu-north-1", detail }],
  });

  assert.equal(r.exitCode, 2, "an empty catalog is could-not-check, never divergence");
  assert.deepEqual(r.bad, [], "no row may be reported as a divergence");
  assert.deepEqual(r.unchecked.map((row) => row.name).sort(), ["iqm_emerald", "iqm_garnet"]);
  assert.match(r.out, /4\/5 regions read/, "the header must not claim full coverage");
  assert.match(r.out, /could not read — SearchDevices returned an empty catalog/);
  assert.doesNotMatch(r.out, /STALE/);
  assert.doesNotMatch(r.out, /divergence\(s\):/);
});

test("EVERY region answering with an empty catalog is exit 2 with zero divergences", () => {
  // Ten STALE rows and exit 1 was the measured behaviour before the sanity floor.
  const detail = unusableResponse({ devices: [] });
  const r = run({
    devices: DEVICES,
    live: new Map(),
    regions: REGIONS,
    unreadable: REGIONS.map((region) => ({ region, detail })),
  });
  assert.equal(r.exitCode, 2);
  assert.deepEqual(r.bad, []);
  assert.equal(r.unchecked.length, Object.keys(DEVICES).length);
  assert.match(r.out, /0\/5 regions read/);
  assert.doesNotMatch(r.out, /STALE/);
});

test("a response that cannot be believed is named; a real catalog is believed", () => {
  // nextToken: searchDevices() reads only `parsed.devices` and follows no page, so a
  // truncated answer is indistinguishable from a short catalog — which is the mechanism
  // that turns a partial read into confirmed retirements. AWS CLI v2 auto-paginates, so
  // a token appearing at all means that assumption changed; refuse rather than compare.
  assert.match(unusableResponse({ devices: [], nextToken: "abc" }), /nextToken/);
  assert.match(unusableResponse({ devices: [{ deviceArn: SV1 }], nextToken: "abc" }), /nextToken/);
  assert.match(unusableResponse({}), /no devices array/);
  assert.match(unusableResponse(null), /no devices array/);
  assert.match(unusableResponse({ devices: "not-an-array" }), /no devices array/);
  assert.equal(unusableResponse({ devices: [{ deviceArn: SV1, deviceStatus: "ONLINE" }] }), "");
});

test("a partial outage in a region that could not have listed the device changes nothing", () => {
  // us-west-1 lists neither Garnet nor Forte. Losing it must not make either unread —
  // over-reporting "unchecked" would eventually make the check useless in the other
  // direction, so blindness is per-ARN, not per-run.
  const unreadable = [{ region: "us-west-1", detail: "timed out" }];
  const r = run({ devices: DEVICES, live: fullCatalog(), regions: REGIONS, unreadable });
  assert.equal(r.state("iqm_garnet"), "OK");
  assert.equal(r.state("ionq_forte"), "OK");
  // sv1/tn1 are region-less: us-west-1 COULD have listed them, but both already agree
  // with the table from the regions that answered, so neither is unread.
  assert.equal(r.state("sv1"), "OK");
  assert.deepEqual(r.unchecked, []);
  // Still not clean: exit 2, because a stranger in us-west-1 would have been invisible.
  assert.equal(r.exitCode, 2);
  assert.match(r.out, /not a clean bill of health/);
});

/* ------------------------------------------------------- genuine divergences */

test("a genuinely retired device is STALE and fails the run", () => {
  const live = fullCatalog({
    [GARNET]: { statuses: ["RETIRED"], regions: ["eu-north-1"], name: "Garnet", provider: "IQM" },
  });
  const r = run({ devices: DEVICES, live, regions: REGIONS });
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.bad.map((row) => row.name), ["iqm_garnet"]);
  assert.match(r.out, /STALE {5}iqm_garnet/);
  assert.match(r.out, /devices\.py says ONLINE; Braket says RETIRED \(eu-north-1\)/);
  assert.match(r.out, /1 divergence\(s\): 1 row\(s\) the live fleet contradicts/);
});

test("a device the catalog no longer lists at all is STALE only when every region answered", () => {
  const r = run({ devices: DEVICES, live: fullCatalog({ [GARNET]: null }), regions: REGIONS });
  assert.equal(r.exitCode, 1);
  assert.match(r.out, /the ARN is not returned in any scanned region/);

  // The same absence with eu-north-1 unread is the outage case, not a retirement.
  const outage = run({
    devices: DEVICES,
    live: fullCatalog({ [GARNET]: null }),
    regions: REGIONS,
    unreadable: [{ region: "eu-north-1", detail: "AccessDeniedException" }],
  });
  assert.equal(outage.exitCode, 2);
  assert.equal(outage.state("iqm_garnet"), "UNCHECKED");
});

test("a genuinely new ONLINE device the repo has no row for is UNKNOWN and fails the run", () => {
  const live = fullCatalog({
    [CEPHEUS]: { statuses: ["ONLINE"], regions: ["us-west-1"], name: "Cepheus-1-108Q", provider: "Rigetti" },
  });
  const r = run({ devices: DEVICES, live, regions: REGIONS });
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.bad.map((row) => row.arn), [CEPHEUS]);
  assert.match(r.out, /UNKNOWN {3}Rigetti Cepheus-1-108Q/);
  assert.match(r.out, /Braket lists this ONLINE in us-west-1; devices\.py has no row for it/);
  assert.match(r.out, /1 ONLINE device\(s\) the curriculum has never heard of/);
});

test("a RETIRED stranger is not news", () => {
  const live = fullCatalog({
    [CEPHEUS]: { statuses: ["RETIRED"], regions: ["us-west-1"], name: "Cepheus-1-108Q", provider: "Rigetti" },
  });
  const r = run({ devices: DEVICES, live, regions: REGIONS });
  assert.equal(r.exitCode, 0);
  assert.doesNotMatch(r.out, /Cepheus/);
});

test("divergence outranks an unreadable region; an unread row never promotes to divergence", () => {
  // Both halves of the drift-check precedence, in one run: a real retirement in a
  // region that answered, plus a region that did not.
  const live = withoutRegion(
    fullCatalog({ [FORTE]: { statuses: ["RETIRED"], regions: ["us-east-1"], name: "Forte 1", provider: "IonQ" } }),
    "eu-north-1",
  );
  const r = run({
    devices: DEVICES,
    live,
    regions: REGIONS,
    unreadable: [{ region: "eu-north-1", detail: "AccessDeniedException" }],
  });
  assert.equal(r.exitCode, 1, "a real divergence must not hide behind an infrastructure excuse");
  assert.deepEqual(r.bad.map((row) => row.name), ["ionq_forte"]);
  assert.deepEqual(r.unchecked.map((row) => row.name).sort(), ["iqm_emerald", "iqm_garnet"]);
  // The report says BOTH things: what to act on, and what was never read.
  assert.match(r.out, /1 divergence\(s\)/);
  assert.match(r.out, /2 row\(s\) could NOT be checked/);
});

/* ---------------------------------------------------------------- ACK rules */

test("an acknowledged divergence prints as ACK and does not fail the run", () => {
  const acknowledged = [{ arn: GARNET, reason: "a stated reason", clearsWhen: "a stated condition" }];
  const live = fullCatalog({
    [GARNET]: { statuses: ["OFFLINE"], regions: ["eu-north-1"], name: "Garnet", provider: "IQM" },
  });
  const r = run({ devices: DEVICES, live, regions: REGIONS, acknowledged });
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.bad, []);
  assert.match(r.out, /ACK {7}iqm_garnet/);
  assert.match(r.out, /ACKNOWLEDGED: a stated reason/);
  assert.match(r.out, /clears when: a stated condition/);
  assert.match(r.out, /1 divergence\(s\) acknowledged on purpose/);
});

test("an ACK cannot launder an unread region, and reports itself stale when it does nothing", () => {
  // The drift check's rule, mirrored: a hold declares that DRIFT is deliberate, and a
  // region that did not answer produced no drift to declare. So the row stays UNCHECKED
  // (exit 2, not 0) and the entry is called out as matching nothing.
  const acknowledged = [{ arn: GARNET, reason: "a stated reason", clearsWhen: "a stated condition" }];
  const r = run({
    devices: DEVICES,
    live: withoutRegion(fullCatalog(), "eu-north-1"),
    regions: REGIONS,
    unreadable: [{ region: "eu-north-1", detail: "AccessDeniedException" }],
    acknowledged,
  });
  assert.equal(r.exitCode, 2);
  assert.equal(r.state("iqm_garnet"), "UNCHECKED");
  assert.deepEqual(r.staleAcks, acknowledged);
  assert.match(r.out, /no longer matches any divergence/);
});

/* --------------------------------------------------------- parse / coverage */

test("a repo row in a region this check does not scan is refused, not reported clean", () => {
  const devices = { ...DEVICES, somewhere_else: { arn: "arn:aws:braket:ap-southeast-1::device/qpu/x/Y", status: "ONLINE" } };
  assert.deepEqual(unscannedDevices(devices, REGIONS), ["somewhere_else (ap-southeast-1)"]);
  assert.deepEqual(unscannedDevices(DEVICES, REGIONS), []);
});

test("which regions could have listed a device is decided by its ARN", () => {
  assert.equal(arnRegion(GARNET), "eu-north-1");
  assert.equal(arnRegion(SV1), "", "a region-less simulator ARN pins no region");
  assert.equal(arnRegion(undefined), "");
  assert.equal(arnRegion("not-an-arn"), "");

  // A region-less ARN is blind only when EVERY region is unread; a pinned one the
  // moment its own region is.
  assert.deepEqual(coverage(SV1, ["us-east-1"], REGIONS).blind, ["us-west-1", "us-west-2", "eu-west-2", "eu-north-1"]);
  assert.deepEqual(coverage(GARNET, ["us-east-1"], REGIONS).blind, ["eu-north-1"]);
  assert.deepEqual(coverage(GARNET, REGIONS, REGIONS).blind, []);
});

test("a PARSE FAILURE reports python's own reason, which is the last line it printed", () => {
  // devices.py is read by ast.literal_eval in a subprocess (see readRepoDevices in
  // scripts/check-device-fleet.mjs), and the shell exits 2 with this line. The first
  // lines of the traceback are frames from ast.py and say nothing an operator can use.
  const traceback = [
    "Traceback (most recent call last):",
    '  File "<string>", line 6, in <module>',
    '  File "/usr/lib/python3.12/ast.py", line 110, in literal_eval',
    "    return _convert(node_or_string)",
    "ValueError: malformed node or string on line 3: <ast.Call object>",
  ].join("\n");
  assert.equal(lastLine(traceback), "ValueError: malformed node or string on line 3: <ast.Call object>");
  assert.equal(
    lastLine("Traceback (most recent call last):\nno literal DEVICES assignment found in lib/hardware/devices.py\n"),
    "no literal DEVICES assignment found in lib/hardware/devices.py",
  );
  assert.equal(lastLine(""), "");
  assert.equal(lastLine(undefined), "");
});

test("effectiveStatus returns null, not ABSENT, when nothing listed the device", () => {
  // The single line the whole partial-outage defect lived on. "ABSENT" is a claim
  // about the catalog; only the caller knows whether the catalog was read.
  assert.equal(effectiveStatus([]), null);
  assert.equal(effectiveStatus(undefined), null);
  assert.equal(effectiveStatus(["ONLINE"]), "ONLINE");
  assert.equal(effectiveStatus(["RETIRED", "ONLINE"]), "ONLINE", "reachable anywhere means reachable");
  assert.equal(effectiveStatus(["RETIRED", "OFFLINE"]), "OFFLINE", "report the reversible state");
  assert.equal(effectiveStatus(["RETIRED", "RETIRED"]), "RETIRED");
});

test("a row with no explicit status is assumed ONLINE", () => {
  const devices = { iqm_garnet: { arn: GARNET } };
  const r = run({ devices, live: fullCatalog(), regions: REGIONS });
  assert.equal(r.state("iqm_garnet"), "OK");
  assert.equal(r.rows[0].claimed, "ONLINE");
});

/* ---------------------------------------------------- credentials vs the CLI */

test("no credentials in scope is a skip; a missing or broken aws CLI is not", () => {
  // The sibling guards (check-lambda-drift.mjs, check-rate-parity.mjs) exit 2 under the
  // identical fault. Skipping on it produced a green nightly inside a job that had
  // configured credentials one step earlier and then compared nothing.
  const enoent = Object.assign(new Error("spawnSync aws ENOENT"), { code: "ENOENT" });
  assert.equal(classifyAwsFailure(enoent).kind, "unusable");

  const shim127 = Object.assign(new Error("Command failed: aws sts get-caller-identity"), {
    status: 127,
    stderr: "sh: aws: command not found\n",
  });
  assert.equal(classifyAwsFailure(shim127).kind, "unusable");
  assert.equal(classifyAwsFailure(shim127).detail, "sh: aws: command not found");

  assert.equal(classifyAwsFailure({ code: "EACCES", stderr: "" }).kind, "unusable");
  assert.equal(classifyAwsFailure({ signal: "SIGTERM", stderr: "" }).kind, "unusable");

  for (const said of [
    "Unable to locate credentials. You can configure credentials by running \"aws configure\".",
    "The config profile (ql-prod) could not be found",
    "An error occurred (ExpiredToken) when calling the GetCallerIdentity operation: The security token included in the request is expired",
    "Error loading SSO Token: Token for quantum does not exist",
  ]) {
    assert.equal(classifyAwsFailure({ status: 255, stderr: said }).kind, "no-credentials", said);
  }

  // Anything unrecognised fails toward "could not check", never toward a silent skip.
  assert.equal(
    classifyAwsFailure({ status: 255, stderr: "An error occurred (ServiceUnavailable) when calling GetCallerIdentity" }).kind,
    "unusable",
  );
});
