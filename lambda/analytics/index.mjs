/**
 * quantum-analytics: how many real people used the site yesterday?
 *
 * Amplify's GenerateAccessLogs returns roughly one day per call and refuses
 * wider windows, so the only way to hold a history is to collect it daily and
 * keep the aggregate. This runs once a day, classifies the previous day's
 * requests, and writes ONE row of counts.
 *
 * WHAT THIS DELIBERATELY DOES NOT STORE: addresses, user agents, paths, or
 * anything else that identifies a visitor. Only counts are written. The privacy
 * policy states, in both locales, that no analytics or tracking scripts exist
 * anywhere on the site, and that remains true — nothing is added to the browser,
 * no cookie, no identifier, no beacon. The logs being read here already exist
 * and are already disclosed as operational service logs. Keep it that way: the
 * moment this writes an IP, that promise needs rewriting.
 *
 * All classification lives in classify.mjs, which the ops script
 * scripts/analytics/backfill.mjs imports from here — the same code answers the
 * historical question and the daily one, so the two can never disagree.
 */

import { AmplifyClient, GenerateAccessLogsCommand } from "@aws-sdk/client-amplify";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SITE_HOST, buildRangeIndex, parseLog, summarizeDay } from "./classify.mjs";

export const AWS_RANGES_URL = "https://ip-ranges.amazonaws.com/ip-ranges.json";

/** Oldest day with retrievable logs, verified. Nothing before it can exist. */
export const LAUNCH_DAY = "2026-06-28";

/** The day before `today`, in UTC. */
export function previousDay(today) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Refuse a date that is not one, before it reaches an AWS call or a key.
 *
 * `event.day` is caller-supplied and lands in two places that both fail
 * quietly. As the Amplify window it becomes `new Date("2026-8-19T00:00:00Z")`,
 * an Invalid Date the SDK serializes to `startTime: null` — so a malformed day
 * degrades to a DEFAULT window rather than erroring, and the row it produces is
 * not the day it claims to be. As the partition key it becomes a SECOND,
 * differently-spelled row for a day that already has one. The sibling ops
 * script validates its own date flags; the Lambda, which an IAM principal can
 * invoke directly, did not.
 */
export function assertDay(label, value) {
  const bad = (why) => new Error(`${label} ${why}: ${JSON.stringify(value)}`);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad("must be YYYY-MM-DD");
  const d = new Date(`${value}T00:00:00Z`);
  // Round-trip, so 2026-02-30 and 2026-13-01 are rejected rather than rolled.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw bad("is not a real date");
  return value;
}

export function createAnalyticsCore({ amplify, ddb, fetchImpl, tableName, appId, domain, siteHost = SITE_HOST }) {
  let cachedRanges = null;

  /**
   * AWS's published prefixes — the strongest bot signal available.
   *
   * If this cannot be fetched the run still proceeds, but the result is stamped
   * so nobody reads an inflated human count as a real one. Silently degrading
   * to "everything is human" would be worse than a gap.
   */
  async function ranges() {
    if (cachedRanges) return cachedRanges;
    try {
      const res = await fetchImpl(AWS_RANGES_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cachedRanges = { index: buildRangeIndex(await res.json()), complete: true };
    } catch (err) {
      cachedRanges = { index: buildRangeIndex([]), complete: false, why: err.message };
    }
    return cachedRanges;
  }

  return async function core(event = {}) {
    const today = assertDay("today", event.today ?? new Date().toISOString().slice(0, 10));
    const day = assertDay("day", event.day ?? previousDay(today));
    if (day > today) throw new Error(`day is in the future: ${day} (today is ${today})`);
    if (day < LAUNCH_DAY) throw new Error(`day precedes launch (${LAUNCH_DAY}): ${day}`);

    // A day the CALLER named is a re-run, and the documented recovery for a
    // missed day is exactly that. The scheduled path may keep overwriting its
    // own row freely; a re-run may not silently replace a good row with the
    // zeroes an aged-out log produces, on the only copy of the history.
    const requested = event.day !== undefined;

    const { logUrl } = await amplify.send(
      new GenerateAccessLogsCommand({
        appId,
        domainName: domain,
        startTime: new Date(`${day}T00:00:00Z`),
        endTime: new Date(`${day}T23:59:59Z`),
      }),
    );
    if (!logUrl) throw new Error(`no logUrl returned for ${day}`);

    const res = await fetchImpl(logUrl);
    if (!res.ok) throw new Error(`log download for ${day} failed: HTTP ${res.status}`);
    const { rows, malformed } = parseLog(await res.text());

    const { index, complete, why } = await ranges();
    const summary = summarizeDay(rows, index, { day, siteHost });

    // The published-range fetch is allowed to fail — but a run that degrades
    // this way SUCCEEDS, so errors, throttles, did-not-run, slow and
    // matched-nothing all stay green while every cloud-hosted crawler that
    // survived the other signals is counted as a person. Recording it on the
    // row alone means the only way to notice is to hand-read a boolean, which
    // is the "plausible numbers, every alarm green" mode this stack exists to
    // close. Emitted as a distinctive line so a metric filter can alarm on it
    // (quantum-analytics-bot-filter-incomplete).
    if (!complete) {
      console.warn(
        `analytics-bot-filter-incomplete day=${day} why=${why} — the datacenter filter did not ` +
          `run, so humans is an OVERCOUNT for this day`,
      );
    }

    // A run that fetched rows but matched NONE of them is a broken host filter,
    // not a quiet day — and the two are indistinguishable from `requests: 0`
    // alone, which is why this stack recorded zeroes for weeks while every
    // alarm stayed green. Emitted as a distinctive line so a metric filter can
    // alarm on it (quantum-analytics-matched-nothing), and persisted on the row
    // so a later reader can tell measurement from breakage without guessing.
    if (summary.requests === 0 && summary.offSiteRequests > 0) {
      console.warn(
        `analytics-matched-nothing day=${day} offSiteRequests=${summary.offSiteRequests} ` +
          `siteHost=${siteHost} — the log had rows and none matched the host filter`
      );
    }

    const item = {
      day: { S: day },
      requests: { N: String(summary.requests) },
      offSiteRequests: { N: String(summary.offSiteRequests) },
      uniqueIps: { N: String(summary.uniqueIps) },
      humans: { N: String(summary.humans) },
      humanPageViews: { N: String(summary.humanPageViews) },
      googleSignIns: { N: String(summary.googleSignIns) },
      malformed: { N: String(malformed) },
      buckets: { M: Object.fromEntries(Object.entries(summary.buckets).map(([k, v]) => [k, { N: String(v) }])) },
      // Without the ranges, the datacenter filter did not run and `humans` is
      // an overcount. Recorded on the row so a later reader is not misled.
      botFilterComplete: { BOOL: Boolean(complete) },
      computedAt: { S: new Date().toISOString() },
    };
    if (!complete) item.botFilterNote = { S: String(why).slice(0, 200) };

    const put = { TableName: tableName, Item: item };
    if (requested && event.overwrite !== true) {
      // Absent, or already zero, is safe to write. A non-zero row is a real
      // measurement and outranks anything a re-run can produce today.
      put.ConditionExpression = "attribute_not_exists(#d) OR requests = :zero";
      put.ExpressionAttributeNames = { "#d": "day" };
      put.ExpressionAttributeValues = { ":zero": { N: "0" } };
    }

    try {
      await ddb.send(new PutItemCommand(put));
    } catch (err) {
      if (err?.name !== "ConditionalCheckFailedException") throw err;
      // Not an error: the guard did its job. Deliberately NOT alarmed — the
      // operator asked for this day and is reading the response.
      console.warn(
        `analytics-kept-existing-row day=${day} — a non-zero row already exists and was NOT ` +
          `replaced. Amplify's retention is finite, so a re-run this late usually re-reads a ` +
          `shorter log. Pass {"day":"${day}","overwrite":true} if the new counts are the better ones.`,
      );
      return { day, ...summary, malformed, botFilterComplete: Boolean(complete), written: false };
    }

    return { day, ...summary, malformed, botFilterComplete: Boolean(complete), written: true };
  };
}

const core = createAnalyticsCore({
  amplify: new AmplifyClient({}),
  ddb: new DynamoDBClient({}),
  fetchImpl: (...a) => fetch(...a),
  tableName: process.env.TABLE_NAME,
  appId: process.env.AMPLIFY_APP_ID,
  domain: process.env.AMPLIFY_DOMAIN,
  // Every environment read lives here, at the composition root, the way
  // lambda/qpu and lambda/review-email do it — classify.mjs stays (data in) ->
  // (data out) and SITE_HOST is its default, not its source of truth.
  siteHost: process.env.SITE_HOST || SITE_HOST,
});

export const handler = (event) => core(event);
