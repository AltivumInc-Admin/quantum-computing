#!/usr/bin/env node
/**
 * How many real people have used this site, on which days, since launch?
 *
 * On 2026-08-20 answering "how many users do we have?" took an afternoon of
 * ad-hoc AWS calls, and the traffic half of the answer could only be sampled
 * three days at a time. Amplify's GenerateAccessLogs returns roughly one day
 * per call — 7- and 14-day windows fail outright — so there was no way to see
 * whether the crawler-only pattern was new or constant without doing it by
 * hand, repeatedly. This does it once and caches the result.
 *
 * It also extracts the only Google sign-in signal this account has. Cognito's
 * FederationSuccesses metric reads 0 despite five federated accounts existing,
 * CloudTrail logs no sign-in events, and Cognito threat protection cannot be
 * used with federated sign-in at all. The hosted-UI redirect lands on our own
 * origin, so /auth/callback with an accounts.google.com referer is the record.
 *
 * Usage:  node scripts/analytics/backfill.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *                                             [--cache DIR] [--json] [--profile NAME]
 *                                             [--app-id ID] [--domain APEX]
 *                                             [--site-host HOST]
 * Exit:   0 = every day in range retrieved   1 = retrieved with gaps or a host
 *                                                filter that matched nothing
 *         2 = could not run (bad usage, missing aws CLI, no credentials)
 *
 * Replaying a day the site served under an OLD hostname takes all three
 * identity flags together, because all three moved together at the cutover:
 *
 *   --app-id d1ao02to23x85y --domain altivum.ai --site-host quantum.altivum.ai
 *
 * Read-only. It calls amplify:GenerateAccessLogs and downloads the presigned
 * result; it mutates nothing.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildRangeIndex, parseLog, summarizeDay } from "../../lambda/analytics/classify.mjs";
import { fetchDayCsv } from "../../lambda/analytics/retrieve.mjs";

const LAUNCH = "2026-06-28"; // Oldest day with retrievable logs, verified.
const AWS_RANGES = "https://ip-ranges.amazonaws.com/ip-ranges.json";
const TEMPLATE = new URL("../../lambda/analytics/template.yaml", import.meta.url);

/**
 * The collector's identity comes from the STACK, never from a copy here.
 *
 * This script restated the app id, the apex and (through classify.mjs) the host
 * filter as constants, and the QL-Prod cutover moved the Lambda without moving
 * them. The result was worse than an error: it fetched the retired Altivum
 * app's logs, matched none of them against the new host, printed a table of
 * zeroes and exited 0. Slicing the defaults out of template.yaml means the
 * script cannot lag a deploy again, and the three flags below make replaying a
 * pre-cutover day an explicit, visible choice.
 */
function paramDefault(name) {
  const lines = readFileSync(TEMPLATE, "utf8").split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) throw new Error(`template.yaml has no ${name} parameter`);
  const body = [];
  for (let i = start + 1; i < lines.length && !/^ {0,2}\S/.test(lines[i]); i++) body.push(lines[i]);
  const value = body.join("\n").match(/^\s+Default: (.+)$/m)?.[1]?.trim();
  if (!value) throw new Error(`template.yaml's ${name} parameter has no Default`);
  return value;
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const asJson = args.includes("--json");

const cacheDir = flag("--cache") ?? ".analytics-cache";
const from = flag("--from") ?? LAUNCH;
const to = flag("--to") ?? new Date().toISOString().slice(0, 10);
const profile = flag("--profile");
const appId = flag("--app-id") ?? paramDefault("AmplifyAppId");
// The association is the apex; a subdomain returns NotFoundException.
const domain = flag("--domain") ?? paramDefault("AmplifyDomain");
const siteHost = flag("--site-host") ?? paramDefault("SiteHost");

if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
  console.error("  --from and --to must be YYYY-MM-DD.");
  process.exit(2);
}
if (from > to) {
  console.error(`  --from ${from} is after --to ${to}.`);
  process.exit(2);
}

const aws = (a) =>
  execFileSync("aws", profile ? [...a, "--profile", profile] : a, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

const days = () => {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

/**
 * Ask Amplify for one window and download it.
 *
 * The result URL is presigned — it is a bearer credential with an hour of life.
 * It is fetched rather than curled deliberately: an argument is world-readable
 * in the process table, and this repo's scripts already hold the line that
 * secrets travel by environment or in-process, never in argv.
 */
async function fetchWindow(startIso, endIso) {
  const out = aws([
    "amplify",
    "generate-access-logs",
    "--app-id",
    appId,
    "--domain-name",
    domain,
    "--start-time",
    startIso,
    "--end-time",
    endIso,
    "--output",
    "json",
  ]);
  const url = JSON.parse(out).logUrl;
  if (!url) throw new Error("no logUrl in response");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  return res.text();
}

/**
 * Retrieve a day, halving the window when the API refuses its size.
 *
 * The halving lives in lambda/analytics/retrieve.mjs, shared with the scheduled
 * collector — it was written here first, against the real API, and the Lambda
 * went without it until a size refusal would have cost a day permanently.
 */
const fetchDay = (day) => fetchDayCsv(day, fetchWindow);

/** AWS's published prefixes, cached. A network failure must not fail the run. */
async function loadRanges() {
  const path = join(cacheDir, "ip-ranges.json");
  try {
    const res = await fetch(AWS_RANGES);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    JSON.parse(text);
    writeFileSync(path, text);
    return { index: buildRangeIndex(JSON.parse(text)), source: "fetched" };
  } catch (err) {
    if (existsSync(path)) {
      return { index: buildRangeIndex(JSON.parse(readFileSync(path, "utf8"))), source: "cached" };
    }
    return { index: buildRangeIndex([]), source: `UNAVAILABLE (${err.message})` };
  }
}

/**
 * Say which account answered, before spending an afternoon reading its logs.
 *
 * `aws --version` only proved the binary exists. This repo's rule is that a
 * profile name is not evidence of an account, and the default profile is a
 * DIFFERENT organization from the one this app runs in — so the identity is
 * resolved once, printed to stderr, and a failure to resolve it stops the run
 * rather than letting ambient credentials silently answer for someone else.
 */
function whoAmI() {
  const out = aws(["sts", "get-caller-identity", "--output", "json"]);
  const { Account } = JSON.parse(out);
  return { account: Account };
}

async function main() {
  mkdirSync(cacheDir, { recursive: true });

  let caller;
  try {
    caller = whoAmI();
  } catch (err) {
    console.error("  Could not resolve AWS credentials (aws sts get-caller-identity failed).");
    console.error(`  ${String(err?.stderr ?? err?.message ?? err).trim().split("\n").pop()}`);
    process.exit(2);
  }
  process.stderr.write(
    `  account ${caller.account}${profile ? ` via --profile ${profile}` : " (default credentials)"}\n` +
      `  app ${appId}  domain ${domain}  host ${siteHost}\n`,
  );

  const { index, source } = await loadRanges();
  const today = new Date().toISOString().slice(0, 10);
  const list = days();
  const rows = [];
  const gaps = [];

  for (const day of list) {
    const cached = join(cacheDir, `${day}.csv`);
    let csv;
    if (existsSync(cached)) {
      csv = readFileSync(cached, "utf8");
    } else {
      try {
        csv = await fetchDay(day);
        // Today is still accumulating; caching it would freeze a partial day.
        if (day < today) writeFileSync(cached, csv);
      } catch (err) {
        gaps.push({ day, why: err.message });
        if (!asJson) process.stderr.write(`  ${day}  UNAVAILABLE\n`);
        continue;
      }
    }

    const { rows: parsed, malformed } = parseLog(csv);
    const summary = summarizeDay(parsed, index, { day, siteHost });
    summary.malformed = malformed;
    rows.push(summary);

    // The same check index.mjs makes before it alarms: a day that fetched rows
    // and matched NONE of them is a wrong host filter, not a quiet day. Without
    // it this script prints zeroes and exits 0 — the exact failure the deployed
    // stack now pages on, silent in the tool that populates the history.
    if (summary.requests === 0 && summary.offSiteRequests > 0) {
      gaps.push({ day, why: `MISMATCHED: ${summary.offSiteRequests} row(s), none for host ${siteHost}` });
      if (!asJson) process.stderr.write(`  ${day}  MISMATCHED  (host ${siteHost})\n`);
      continue;
    }

    if (!asJson) {
      process.stderr.write(
        `  ${day}  ${String(summary.requests).padStart(6)} req  ` +
          `${String(summary.humans).padStart(3)} human  ` +
          `${String(summary.googleSignIns).padStart(2)} google\n`,
      );
    }
  }

  writeFileSync(join(cacheDir, "daily.json"), JSON.stringify({ from, to, rows, gaps }, null, 2));

  if (asJson) {
    console.log(JSON.stringify({ from, to, rangeSource: source, rows, gaps }, null, 2));
  } else {
    report(rows, gaps, source);
  }
  process.exit(gaps.length > 0 ? 1 : 0);
}

function report(rows, gaps, rangeSource) {
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  const bucket = (k) => rows.reduce((n, r) => n + r.buckets[k], 0);

  console.log(`\n  Who actually reached ${siteHost}  (${from} to ${to})\n`);
  console.log(`  ${"day".padEnd(12)}${"requests".padStart(9)}${"IPs".padStart(6)}${"humans".padStart(8)}${"pages".padStart(7)}${"google".padStart(8)}`);
  for (const r of rows) {
    if (r.requests === 0 && r.humans === 0 && r.googleSignIns === 0) continue;
    console.log(
      `  ${r.day.padEnd(12)}${String(r.requests).padStart(9)}${String(r.uniqueIps).padStart(6)}` +
        `${String(r.humans).padStart(8)}${String(r.humanPageViews).padStart(7)}${String(r.googleSignIns).padStart(8)}`,
    );
  }

  console.log(`\n  Totals over ${rows.length} day(s)`);
  console.log(`    requests                ${sum("requests")}`);
  console.log(`    human visits            ${sum("humans")}`);
  console.log(`    human page views        ${sum("humanPageViews")}`);
  console.log(`    google sign-ins         ${sum("googleSignIns")}`);

  console.log(`\n  What was filtered out, and by which signal`);
  for (const k of ["scanner", "declared-bot", "datacenter", "no-page-view", "no-assets", "high-volume", "high-rate"]) {
    console.log(`    ${k.padEnd(22)}${bucket(k)}`);
  }

  const malformed = sum("malformed");
  if (malformed > 0) console.log(`\n  ${malformed} log line(s) could not be parsed.`);
  console.log(`\n  AWS IP ranges: ${rangeSource}`);
  if (rangeSource.startsWith("UNAVAILABLE")) {
    console.log("  Datacenter filtering was OFF for this run. Human counts are inflated.");
  }

  if (gaps.length > 0) {
    console.log(`\n  ${gaps.length} day(s) could not be counted:`);
    for (const g of gaps) console.log(`    ${g.day}  ${g.why}`);
    console.log("  The totals above are incomplete. Re-run to retry only the gaps.");
    if (gaps.some((g) => g.why.startsWith("MISMATCHED"))) {
      console.log(
        `  MISMATCHED means the log had rows and none carried host ${siteHost}. A day the\n` +
          "  site served under an older hostname needs --app-id, --domain and --site-host\n" +
          "  together; see the usage header.",
      );
    }
    console.log("");
  } else {
    console.log("");
  }
}

main().catch((err) => {
  console.error(`\n  Failed: ${err.message}\n`);
  process.exit(2);
});
