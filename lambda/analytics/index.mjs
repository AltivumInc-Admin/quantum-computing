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

/** The day before `today`, in UTC. */
export function previousDay(today) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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
    const today = event.today ?? new Date().toISOString().slice(0, 10);
    const day = event.day ?? previousDay(today);

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

    await ddb.send(new PutItemCommand({ TableName: tableName, Item: item }));

    return { day, ...summary, malformed, botFilterComplete: Boolean(complete) };
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
