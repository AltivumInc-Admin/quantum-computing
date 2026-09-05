/**
 * The device-fleet check's rules: which regions could have answered for a device,
 * what a row's verdict is when some of them did not, and what the run's exit code is.
 *
 * Pure and dependency-free so rules.test.mjs can exercise it with no AWS credentials,
 * no network and no node_modules — the same split scripts/drift/rules.mjs already uses.
 * check-device-fleet.mjs is the I/O shell: it shells out to `aws braket search-devices`
 * per region and hands the finished catalog here.
 *
 * The split exists because the interesting cases are exactly the ones a live run cannot
 * rehearse on demand: a region that did not answer, every region that did not answer, an
 * `aws` binary that is not there. Those are decided here, over plain objects, and are
 * therefore testable.
 *
 * WHY IT IS A THREE-WAY PARTITION, not two. The first version of this check folded
 * "Braket does not list this device" and "no region that could have listed it was read"
 * into a single ABSENT status. The consequence was not theoretical: deny SearchDevices
 * in one region — eu-north-1, say — and the run reported "STALE iqm_garnet /
 * iqm_emerald / aqt_ibex_q1, 3 divergence(s)", exit 1, and the workflow then told the
 * operator to go edit lib/hardware/devices.py. An outage rendered as three confirmed
 * device retirements, including the only QPU lambda/qpu is fenced to. scripts/drift/
 * rules.mjs carries the same lesson in its verdict(): unchecked / vacuous / bad, three
 * partitions, "because a row that threw was never read, so it is neither a match nor a
 * mismatch". This module mirrors that, per REGION rather than per function, because a
 * device is only ever listed by the region(s) that could hold it.
 */

/**
 * Every region Amazon Braket serves (verified 2026-09-04 by calling SearchDevices in
 * each). Deliberately the FULL set, not just the regions devices.py names: half this
 * check's job is spotting an ONLINE device the repo has never heard of, and a device
 * the repo has never heard of is precisely the one whose region the repo does not list.
 */
export const REGIONS = ["us-east-1", "us-west-1", "us-west-2", "eu-west-2", "eu-north-1"];

/** How the fleet reports a device the repo row does not carry an explicit status for. */
export const ASSUMED_STATUS = "ONLINE";

/**
 * The region segment of a Braket device ARN, or "" for a region-less one.
 *
 * QPU ARNs pin their region (arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet) and are
 * therefore listed by exactly one region. Simulator ARNs do not
 * (arn:aws:braket:::device/quantum-simulator/amazon/sv1) and come back from every region
 * that offers them, which is why one ARN can carry several statuses.
 */
export function arnRegion(arn) {
  const parts = String(arn ?? "").split(":");
  return parts.length > 3 ? parts[3] : "";
}

/**
 * Which regions COULD have listed this ARN, and which of those were not read.
 *
 * `blind` is the whole point: a device whose only possible region went unread has not
 * been checked, and no verdict about it — clean or stale — is evidence of anything.
 * A candidate region missing from `scanned` counts as blind whatever the reason, so a
 * region dropped from REGIONS fails closed rather than silently narrowing the check.
 */
export function coverage(arn, scanned, regions = REGIONS) {
  const home = arnRegion(arn);
  const candidates = home ? [home] : [...regions];
  return { candidates, blind: candidates.filter((r) => !scanned.includes(r)) };
}

/**
 * One status for a device that may be listed in several regions, or `null` when no
 * region that answered listed it at all.
 *
 * NULL, NOT "ABSENT". Absence is a claim about the catalog, and the caller is the only
 * thing that knows whether the catalog was actually read — see coverage() above. An
 * earlier version returned the string "ABSENT" here, which is exactly how an unread
 * region became a confirmed retirement.
 *
 * ONLINE anywhere means the device is reachable, so the repo calling it live is true.
 * Otherwise OFFLINE beats RETIRED: OFFLINE is a reversible calibration window and
 * RETIRED is permanent, and reporting the reversible one keeps the operator from
 * deleting a machine that is coming back.
 */
export function effectiveStatus(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return null;
  if (statuses.includes("ONLINE")) return "ONLINE";
  if (statuses.includes("OFFLINE")) return "OFFLINE";
  return statuses[0];
}

/** Repo rows naming a region this check does not scan, as "name (region)" strings. */
export function unscannedDevices(devices, regions = REGIONS) {
  const out = [];
  for (const [name, spec] of Object.entries(devices)) {
    const region = arnRegion(spec?.arn);
    if (region && !regions.includes(region)) out.push(`${name} (${region})`);
  }
  return out;
}

/**
 * Why did `aws` fail, and does that justify skipping?
 *
 * The two siblings in this nightly (check-lambda-drift.mjs, check-rate-parity.mjs) both
 * exit 2 when the CLI cannot answer for the caller. This check skips with exit 0
 * instead, because it is the one guard that is useful to run from a fresh clone with no
 * credentials at all — but the first version skipped on ANY failure, so a missing or
 * broken `aws` (exit 127) printed "SKIPPED — no AWS credentials in scope" and exited 0
 * inside a CI job that had configured credentials one step earlier. A green nightly
 * that compared nothing is the failure this whole file exists to prevent.
 *
 * So: only a RECOGNISED credential-resolution failure skips. Anything else — the binary
 * missing, a shim exiting 127, a timeout, a signal, an unrecognised error — is
 * "could not check" and exits 2 like the siblings. Unrecognised fails toward exit 2 on
 * purpose: a new failure mode must not quietly join the skip list.
 *
 * Returns { kind: "no-credentials" | "unusable", detail }.
 */
const NO_CREDENTIALS = [
  /Unable to locate credentials/i,
  /Unable to locate a credential/i,
  /NoCredentialProviders/i,
  /NoCredentialsError/i,
  /You must specify a region/i,
  /The config profile .* could not be found/i,
  /ProfileNotFound/i,
  /ExpiredToken/i,
  /security token included in the request is (expired|invalid)/i,
  /InvalidClientTokenId/i,
  /Token has expired and refresh failed/i,
  /Error loading SSO Token/i,
  /session associated with this profile has expired/i,
];

export function classifyAwsFailure(err) {
  const stderr = String(err?.stderr ?? "");
  const message = String(err?.message ?? "");
  const detail = firstLine(stderr) || firstLine(message) || "unknown error";
  // Could not even run the program: ENOENT (not on PATH), EACCES (not executable), or a
  // shell reporting 127/126 for the same two conditions. No credential story explains
  // any of these.
  if (err?.code === "ENOENT" || err?.code === "EACCES") return { kind: "unusable", detail };
  if (err?.status === 127 || err?.status === 126) return { kind: "unusable", detail };
  if (err?.signal) return { kind: "unusable", detail };
  if (NO_CREDENTIALS.some((re) => re.test(stderr))) return { kind: "no-credentials", detail };
  return { kind: "unusable", detail };
}

/** A child's own first non-empty line — the part an operator can act on. */
export function firstLine(text) {
  return (
    String(text ?? "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
}

/**
 * The LAST non-empty line — which is where a python traceback keeps its reason.
 *
 * devices.py is read by ast.literal_eval in a subprocess, so a table with a computed
 * value or a missing DEVICES assignment comes back as a traceback whose first lines are
 * frames from ast.py. "ValueError: malformed node" or "no literal DEVICES assignment
 * found" is the last line, and it is the only part an operator can act on.
 */
export function lastLine(text) {
  return (
    String(text ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop() ?? ""
  );
}

/**
 * Every row's verdict, in both directions, given what was actually read.
 *
 * @param {object} args
 * @param {Record<string, {arn?: string, status?: string}>} args.devices  the repo table
 * @param {Map<string, {statuses: string[], regions: string[], name?: string, provider?: string}>} args.live
 * @param {string[]} args.regions      every region this check scans
 * @param {{region: string, detail: string}[]} args.unreadable  regions that did not answer
 * @param {{arn: string, reason: string, clearsWhen: string}[]} args.acknowledged
 *
 * Row states:
 *   OK        the live fleet agrees with the row
 *   STALE     the live fleet contradicts the row, and every region that could have
 *             listed it answered — somebody owes a curriculum edit
 *   UNCHECKED the live fleet appears to contradict the row, but a region that could
 *             have listed it did not answer. NOT a divergence, and not clean either
 *   ACK       a STALE row someone chose to live with, with a reason and a clears-when
 *   UNKNOWN   an ONLINE device the repo has no row for
 */
export function evaluate({ devices, live, regions = REGIONS, unreadable = [], acknowledged = [] }) {
  const scanned = regions.filter((r) => !unreadable.some((u) => u.region === r));
  const ackFor = (arn) => acknowledged.find((a) => a.arn === arn) ?? null;
  const rows = [];

  // Direction 1 — every row the repo carries, checked against the live catalog.
  for (const [name, spec] of Object.entries(devices)) {
    const arn = String(spec?.arn ?? "");
    const claimed = String(spec?.status ?? ASSUMED_STATUS).toUpperCase();
    const entry = live.get(arn);
    const observed = effectiveStatus(entry?.statuses ?? []);
    const { candidates, blind } = coverage(arn, scanned, regions);
    const where = entry ? entry.regions.join(", ") : "nowhere";
    const row = { kind: "repo", name, arn, claimed, actual: observed ?? "ABSENT", where, candidates, blind, ack: null };

    if (observed === claimed) {
      // A match stands even with a blind region: the run as a whole still refuses to
      // call itself clean while any region is unread (see verdict/render below), so a
      // provisional agreement is never printed as a clean bill of health.
      rows.push({ ...row, state: "OK" });
      continue;
    }
    if (blind.length) {
      // The mismatch may be entirely an artifact of the region that did not answer.
      rows.push({ ...row, state: "UNCHECKED" });
      continue;
    }
    const ack = ackFor(arn);
    rows.push({ ...row, ack, state: ack ? "ACK" : "STALE" });
  }

  // Direction 2 — every ONLINE device the repo has no row for. This is the half no test
  // derived from devices.py can ever produce, because it is about what is NOT in
  // devices.py. An unread region can only HIDE a stranger, never invent one, so nothing
  // here can be an artifact of an outage — the run's exit 2 covers the ones it missed.
  const known = new Set(Object.values(devices).map((s) => String(s?.arn ?? "")));
  for (const [arn, entry] of live) {
    if (known.has(arn)) continue;
    if (effectiveStatus(entry.statuses) !== "ONLINE") continue; // a retired stranger is not news
    const ack = ackFor(arn);
    const onlineIn = entry.regions.filter((_, i) => entry.statuses[i] === "ONLINE");
    rows.push({
      kind: "unknown",
      name: `${entry.provider} ${entry.name}`,
      arn,
      claimed: "no row",
      actual: "ONLINE",
      where: onlineIn.join(", "),
      candidates: [],
      blind: [],
      ack,
      state: ack ? "ACK" : "UNKNOWN",
    });
  }

  return rows;
}

/**
 * The verdict for a finished run: exit code and the summary partitions.
 *
 * THREE partitions, the same precedence scripts/drift/rules.mjs verdict() uses and for
 * the same reason. Divergence (1) wins over could-not-read (2), because "somebody has to
 * act on this" is the actionable half and must not hide behind an infrastructure excuse.
 * But an UNCHECKED row is NOT divergence — it is the infrastructure excuse — so it can
 * only ever produce a 2.
 */
export function verdict(rows, unreadable = [], acknowledged = []) {
  const bad = rows.filter((r) => r.state === "STALE" || r.state === "UNKNOWN");
  const unchecked = rows.filter((r) => r.state === "UNCHECKED");
  const acked = rows.filter((r) => r.state === "ACK");
  const staleAcks = acknowledged.filter((a) => !rows.some((r) => r.state === "ACK" && r.arn === a.arn));
  const exitCode = bad.length ? 1 : unchecked.length || unreadable.length ? 2 : 0;
  return { exitCode, bad, unchecked, acked, staleAcks };
}

/**
 * The human report, as lines. Returned rather than printed so a test can read it.
 */
export function render(rows, { regions = REGIONS, unreadable = [], acknowledged = [], date } = {}) {
  const scanned = regions.filter((r) => !unreadable.some((u) => u.region === r));
  const out = [
    `\n  Braket fleet vs lib/hardware/devices.py  ` +
      `(${scanned.length}/${regions.length} regions read, ${date ?? new Date().toISOString().slice(0, 10)})\n`,
  ];

  for (const r of rows) {
    // A repo row is named by its short-name (the thing a learner types); a stranger is
    // named by provider + device name, because it has no short-name to type yet.
    out.push(`  ${r.state.padEnd(10)}${r.name.padEnd(26)}${r.arn}`);
    if (r.kind === "unknown") {
      out.push(`          Braket lists this ONLINE in ${r.where}; devices.py has no row for it.`);
    } else if (r.state === "UNCHECKED") {
      // Deliberately does NOT say what the row's status "is". The only honest statement
      // is that nothing was read, so nothing is claimed.
      out.push(
        (r.candidates.length === 1
          ? `          NOT CHECKED — ${r.blind[0]} did not answer, and it is the only region\n` +
            `          that could list this ARN.`
          : `          NOT CHECKED — no region that could list this ARN answered\n` +
            `          (${r.blind.join(", ")}; the ARN names no region, so any of them could).`) +
          `\n          devices.py says ${r.claimed}; this run says NOTHING about whether that\n` +
          `          is still true.`,
      );
    } else if (r.state !== "OK") {
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
    out.push(`  ${"??".padEnd(10)}${u.region.padEnd(26)}could not read — ${u.detail}`);
  }

  const v = verdict(rows, unreadable, acknowledged);

  if (v.bad.length) {
    const stale = v.bad.filter((r) => r.kind === "repo").length;
    const strangers = v.bad.filter((r) => r.kind === "unknown").length;
    out.push(
      `\n  ${v.bad.length} divergence(s): ${stale} row(s) the live fleet contradicts, ` +
        `${strangers} ONLINE device(s) the curriculum has never heard of.`,
    );
    out.push(
      `  A STALE row is a dispatch bug: run_circuit prints a cost estimate and submits\n` +
        `  before the service refuses. An UNKNOWN device is curriculum drift — decide\n` +
        `  whether to adopt it, or add it to ACKNOWLEDGED with a reason and a clears-when.\n` +
        `  Reference: 02-hardware/scripts/device_status.py (make devices) prints the same\n` +
        `  live statuses per device.\n`,
    );
  }

  if (v.unchecked.length) {
    out.push(
      `\n  ${v.unchecked.length} row(s) could NOT be checked: the only region(s) that could list\n` +
        `  them did not answer. Those rows are neither current nor stale — they are unread.\n` +
        `  Do NOT edit lib/hardware/devices.py on the strength of this run.`,
    );
  }

  if (unreadable.length && !v.unchecked.length) {
    out.push(
      `\n  No unread row in the ${scanned.length} region(s) that answered — but ` +
        `${unreadable.length} did not,\n  so this is not a clean bill of health: an ONLINE device` +
        ` there would be invisible.\n`,
    );
  } else if (!unreadable.length && !v.bad.length) {
    // The acknowledged count is stated rather than folded into the green line: an ACK is
    // a divergence someone chose to live with, and a summary that hides it reads exactly
    // like a fleet with nothing outstanding.
    out.push(
      `\n  Every unacknowledged row matches the live fleet, and every ONLINE device\n` +
        `  across ${regions.length} regions has a row.` +
        (v.acked.length ? ` ${v.acked.length} divergence(s) acknowledged on purpose (see above).\n` : `\n`),
    );
  }

  for (const a of v.staleAcks) {
    out.push(
      `  NOTE: the ACKNOWLEDGED entry for ${a.arn} no longer matches any divergence.\n` +
        `        It has served its purpose — delete it from scripts/check-device-fleet.mjs.\n`,
    );
  }

  return out;
}
