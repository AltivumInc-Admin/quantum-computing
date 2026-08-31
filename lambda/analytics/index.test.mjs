import test from "node:test";
import assert from "node:assert/strict";

import { createAnalyticsCore, previousDay } from "./index.mjs";

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

function makeCore({ logText = LOG, rangesOk = true, amplifyResponse } = {}) {
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
  return { core: createAnalyticsCore({ amplify, ddb, fetchImpl, tableName: "t", appId: "app", domain: "d" }), amplify, ddb };
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
    "day", "requests", "uniqueIps", "humans", "humanPageViews", "googleSignIns",
    "malformed", "buckets", "botFilterComplete", "computedAt",
  ]);
  for (const key of Object.keys(ddb.calls[0].input.Item)) {
    assert.ok(allowed.has(key), `unexpected attribute written: ${key}`);
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
