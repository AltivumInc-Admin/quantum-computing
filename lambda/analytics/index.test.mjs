import test from "node:test";
import assert from "node:assert/strict";

import { LAUNCH_DAY, createAnalyticsCore, previousDay } from "./index.mjs";

/** Records commands and dispatches on the command's own class name. */
function stubClient(responses = {}) {
  const calls = [];
  return {
    calls,
    send: async (cmd) => {
      calls.push(cmd);
      const r = responses[cmd.constructor.name];
      if (r instanceof Error) throw r;
      return r ?? {};
    },
  };
}

const HEADER =
  "date,time,c-ip,cs-uri-stem,sc-status,cs\\(Referer),cs\\(User-Agent),x-host-header,sc-content-type";

/** A log with one reader (page + asset) and one declared crawler. */
const LOG = [
  HEADER,
  "2026-08-19,10:00:00,198.51.100.4,/,200,-,Mozilla/5.0,learner.quantumenv.dev,text/html",
  "2026-08-19,10:00:01,198.51.100.4,/_next/static/x.js,200,-,Mozilla/5.0,learner.quantumenv.dev,text/javascript",
  "2026-08-19,10:05:00,10.0.0.9,/,200,-,Googlebot/2.1,learner.quantumenv.dev,text/html",
].join("\n");

function makeCore({ logText = LOG, rangesOk = true, amplifyResponse, siteHost } = {}) {
  const amplify = stubClient({
    GenerateAccessLogsCommand: amplifyResponse ?? { logUrl: "https://s3.test/presigned" },
  });
  const ddb = stubClient();
  const fetchImpl = async (url) => {
    if (url.includes("ip-ranges")) {
      if (!rangesOk) throw new Error("network down");
      return { ok: true, json: async () => ({ prefixes: [{ ip_prefix: "10.0.0.0/8" }] }) };
    }
    return { ok: true, text: async () => logText };
  };
  const core = createAnalyticsCore({
    amplify,
    ddb,
    fetchImpl,
    tableName: "t",
    appId: "app",
    domain: "d",
    ...(siteHost === undefined ? {} : { siteHost }),
  });
  return { core, amplify, ddb };
}

test("previousDay steps back one UTC day, across a month boundary", () => {
  assert.equal(previousDay("2026-08-20"), "2026-08-19");
  assert.equal(previousDay("2026-08-01"), "2026-07-31");
  assert.equal(previousDay("2026-01-01"), "2025-12-31");
});

test("defaults to yesterday and writes one row of counts", async () => {
  const { core, ddb } = makeCore();
  const out = await core({ today: "2026-08-20" });

  assert.equal(out.day, "2026-08-19");
  assert.equal(out.humans, 1);
  assert.equal(ddb.calls.length, 1);
  assert.equal(ddb.calls[0].input.Item.day.S, "2026-08-19");
  assert.equal(ddb.calls[0].input.Item.humans.N, "1");
});

test("an explicit day overrides yesterday, so a gap can be re-run", async () => {
  const { core, amplify } = makeCore();
  await core({ day: "2026-07-28", today: "2026-08-20" });
  assert.equal(amplify.calls[0].input.startTime.toISOString(), "2026-07-28T00:00:00.000Z");
});

test("refuses a day that is not a real date, before any AWS call is made", async () => {
  // event.day reaches BOTH the Amplify window and the partition key. Unchecked,
  // "2026-8-19" makes an Invalid Date the SDK serializes to startTime: null —
  // so the call degrades to a default window instead of failing — and then lands
  // as a second, differently-spelled row for a day that already has one.
  for (const day of ["2026-8-19", "19-08-2026", "2026-02-30", "2026-13-01", "", 20260819]) {
    const { core, amplify, ddb } = makeCore();
    await assert.rejects(() => core({ day, today: "2026-08-20" }), /day (must be|is not)/);
    assert.equal(amplify.calls.length, 0, `${day}: nothing may be fetched`);
    assert.equal(ddb.calls.length, 0, `${day}: nothing may be written`);
  }
});

test("refuses a day in the future or before launch — neither can have logs", async () => {
  const { core, ddb } = makeCore();
  await assert.rejects(() => core({ day: "2026-08-21", today: "2026-08-20" }), /future/);
  await assert.rejects(() => core({ day: "2026-06-27", today: "2026-08-20" }), /precedes launch/);
  assert.equal(ddb.calls.length, 0);
  assert.equal(LAUNCH_DAY, "2026-06-28");
});

test("a re-run may not silently replace a good row with zeroes", async () => {
  // The documented recovery for a missed day is an explicit-day invoke, and
  // Amplify's retention is finite — so the late re-run that recovery produces
  // is exactly the one that reads a short log and writes zeroes over a real
  // measurement, on the only copy of the history. The scheduled path (no
  // event.day) is unguarded and still overwrites its own row freely.
  const { core, ddb } = makeCore();
  await core({ today: "2026-08-20" });
  assert.equal(ddb.calls[0].input.ConditionExpression, undefined, "the scheduled path is not guarded");

  await core({ day: "2026-08-19", today: "2026-08-20" });
  const guarded = ddb.calls[1].input;
  assert.equal(guarded.ConditionExpression, "attribute_not_exists(#d) OR requests = :zero");
  assert.deepEqual(guarded.ExpressionAttributeNames, { "#d": "day" });
  assert.deepEqual(guarded.ExpressionAttributeValues, { ":zero": { N: "0" } });

  await core({ day: "2026-08-19", today: "2026-08-20", overwrite: true });
  assert.equal(ddb.calls[2].input.ConditionExpression, undefined, "overwrite: true is the deliberate bypass");
});

test("a refused overwrite is reported, not thrown — the guard working is not an error", async () => {
  const denied = Object.assign(new Error("The conditional request failed"), {
    name: "ConditionalCheckFailedException",
  });
  const amplify = stubClient({ GenerateAccessLogsCommand: { logUrl: "https://s3.test/presigned" } });
  const ddb = stubClient({ PutItemCommand: denied });
  const core = createAnalyticsCore({
    amplify,
    ddb,
    fetchImpl: async (url) =>
      url.includes("ip-ranges")
        ? { ok: true, json: async () => ({ prefixes: [] }) }
        : { ok: true, text: async () => LOG },
    tableName: "t",
    appId: "app",
    domain: "d",
  });

  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const out = await core({ day: "2026-08-19", today: "2026-08-20" });
    assert.equal(out.written, false, "the caller is told the row was kept");
    assert.ok(warnings.some((w) => w.includes("analytics-kept-existing-row")));
    assert.ok(warnings.some((w) => w.includes("overwrite")), "and told how to force it");
  } finally {
    console.warn = realWarn;
  }
});

test("STORES NO IDENTIFIERS — the written item is counts only", async () => {
  // The privacy policy promises no tracking. If this test ever needs relaxing,
  // that copy needs rewriting first, in both locales.
  const { core, ddb } = makeCore();
  await core({ today: "2026-08-20" });

  const written = JSON.stringify(ddb.calls[0].input.Item);
  assert.equal(written.includes("198.51.100.4"), false, "no visitor address");
  assert.equal(written.includes("10.0.0.9"), false, "no visitor address");
  assert.equal(written.includes("Googlebot"), false, "no user agent");
  assert.equal(written.includes("_next"), false, "no request path");

  const allowed = new Set([
    // offSiteRequests is a COUNT of rows whose host header was not ours
    // (rows.length - mine.length) — no address, agent or path, so it keeps the
    // promise. It is stored because `requests: 0` alone cannot distinguish a
    // quiet day from a host filter matching nothing, which is how this stack
    // recorded weeks of zeroes while every alarm stayed green.
    "day", "requests", "offSiteRequests", "uniqueIps", "humans", "humanPageViews",
    "googleSignIns", "malformed", "buckets", "botFilterComplete", "computedAt",
  ]);
  for (const key of Object.keys(ddb.calls[0].input.Item)) {
    assert.ok(allowed.has(key), `unexpected attribute written: ${key}`);
  }
});

test("a log whose rows ALL miss the host filter is flagged, not recorded as a quiet day", async () => {
  // The exact shape that hid for weeks: the collector runs, succeeds, and
  // matches nothing because SITE_HOST names a host the app no longer serves.
  // `requests: 0` alone cannot tell that from a day with no visitors, so the
  // run must SAY so — a metric filter alarms on this line
  // (quantum-analytics-matched-nothing), and offSiteRequests lands on the row.
  // Injected, not string-replaced into the fixture: the host filter is a
  // constructor dependency, so a stale one can be reproduced the way a deploy
  // would actually produce it.
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const { core, ddb } = makeCore({ siteHost: "some-other-host.example" });
    const out = await core({ today: "2026-08-20" });
    assert.equal(out.requests, 0, "none of the rows are ours");
    assert.equal(out.offSiteRequests, 3, "but the log was not empty");
    assert.ok(
      warnings.some((w) => w.includes("analytics-matched-nothing")),
      "must emit the line the metric filter alarms on",
    );
    assert.ok(
      warnings.some((w) => w.includes("siteHost=some-other-host.example")),
      "the warning must name the host it filtered with, not a module constant",
    );
    assert.equal(ddb.calls[0].input.Item.offSiteRequests.N, "3", "diagnostic persisted on the row");
  } finally {
    console.warn = realWarn;
  }
});

test("a genuinely empty log stays silent — zero is a measurement, not a breakage", async () => {
  // The other half, and what keeps the alarm from crying wolf: no rows at all
  // is a quiet day, not a broken filter, and must NOT trigger it.
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const { core } = makeCore({ logText: HEADER });
    const out = await core({ today: "2026-08-20" });
    assert.equal(out.requests, 0);
    assert.equal(out.offSiteRequests, 0);
    assert.equal(
      warnings.some((w) => w.includes("analytics-matched-nothing")),
      false,
      "an empty log must not alarm",
    );
  } finally {
    console.warn = realWarn;
  }
});

test("marks the row when the bot filter could not run, rather than inflating quietly", async () => {
  const { core, ddb } = makeCore({ rangesOk: false });
  const out = await core({ today: "2026-08-20" });

  assert.equal(out.botFilterComplete, false);
  assert.equal(ddb.calls[0].input.Item.botFilterComplete.BOOL, false);
  assert.match(ddb.calls[0].input.Item.botFilterNote.S, /network down/);
});

test("datacenter ranges are applied when they load", async () => {
  // 10.0.0.9 is inside the stubbed 10.0.0.0/8, and is also a declared bot;
  // either way it must not count as a person.
  const { core } = makeCore();
  const out = await core({ today: "2026-08-20" });
  assert.equal(out.buckets.human, 1);
});

test("throws when Amplify returns no log URL, instead of writing a zero day", async () => {
  const { core, ddb } = makeCore({ amplifyResponse: {} });
  await assert.rejects(() => core({ today: "2026-08-20" }), /no logUrl/);
  assert.equal(ddb.calls.length, 0, "nothing may be written on a failed retrieval");
});

test("throws when the log download fails, instead of recording an empty day", async () => {
  const amplify = stubClient({ GenerateAccessLogsCommand: { logUrl: "https://s3.test/x" } });
  const ddb = stubClient();
  const core = createAnalyticsCore({
    amplify,
    ddb,
    fetchImpl: async (url) =>
      url.includes("ip-ranges")
        ? { ok: true, json: async () => ({ prefixes: [] }) }
        : { ok: false, status: 403 },
    tableName: "t",
    appId: "app",
    domain: "d",
  });
  await assert.rejects(() => core({ today: "2026-08-20" }), /HTTP 403/);
  assert.equal(ddb.calls.length, 0);
});

test("a quiet day is recorded as zero, not skipped", async () => {
  const { core, ddb } = makeCore({ logText: HEADER });
  const out = await core({ today: "2026-08-20" });
  assert.equal(out.requests, 0);
  assert.equal(out.humans, 0);
  assert.equal(ddb.calls.length, 1, "a zero day is still a fact worth storing");
});
