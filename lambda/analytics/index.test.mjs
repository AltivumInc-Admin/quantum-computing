import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LAUNCH_DAY,
  LOG_DOWNLOAD_TIMEOUT_MS,
  RANGES_TIMEOUT_MS,
  createAnalyticsCore,
  previousDay,
} from "./index.mjs";

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
  // A function so a test can flip it between invocations of the same core.
  const rangesState = typeof rangesOk === "function" ? rangesOk : () => rangesOk;
  const fetchImpl = async (url) => {
    if (url.includes("ip-ranges")) {
      const state = rangesState();
      if (state === "not-ok") return { ok: false, status: 503 };
      if (!state) throw new Error("network down");
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

test("every module the handler imports is packaged for deployment", () => {
  // `sam build` packages this directory the way npm pack would, so package.json's
  // `files` list decides what reaches Lambda. A new local module that is imported
  // but not listed passes every test here and then fails at runtime, in
  // production, with MODULE_NOT_FOUND — the tests run from the source tree,
  // which always has the file.
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/^import [^;]*? from "\.\/([\w.-]+)";$/gm)) walk(m[1]);
  };
  walk("index.mjs");

  for (const file of seen) {
    assert.ok(pkg.files.includes(file), `${file} is imported by the handler but not in package.json files`);
  }
});

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
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const { core, ddb } = makeCore({ rangesOk: false });
    const out = await core({ today: "2026-08-20" });

    assert.equal(out.botFilterComplete, false);
    assert.equal(ddb.calls[0].input.Item.botFilterComplete.BOOL, false);
    assert.match(ddb.calls[0].input.Item.botFilterNote.S, /network down/);

    // The row alone is not enough: this run SUCCEEDS, so every other alarm in
    // the stack stays green while humans is an overcount. The line is what a
    // metric filter can see (quantum-analytics-bot-filter-incomplete).
    assert.ok(
      warnings.some((w) => w.includes("analytics-bot-filter-incomplete")),
      "must emit the line the metric filter alarms on",
    );
  } finally {
    console.warn = realWarn;
  }
});

test("a healthy run says nothing about the bot filter — the alarm must not cry wolf", async () => {
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const { core } = makeCore();
    await core({ today: "2026-08-20" });
    assert.equal(warnings.some((w) => w.includes("analytics-bot-filter-incomplete")), false);
  } finally {
    console.warn = realWarn;
  }
});

test("a failed prefix fetch is NOT cached — the next run retries it", async () => {
  // ranges() memoized its own failure, so a warm container re-stamped
  // botFilterComplete: false on every later invocation even once the network
  // recovered. The documented recovery for a failed scheduled run is a manual
  // re-invoke, which lands on exactly that container.
  let healthy = false;
  const { core, ddb } = makeCore({ rangesOk: () => healthy });

  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const first = await core({ today: "2026-08-20" });
    assert.equal(first.botFilterComplete, false);

    healthy = true;
    const second = await core({ today: "2026-08-20" });
    assert.equal(second.botFilterComplete, true, "the recovered network must be used");
    assert.equal(ddb.calls[1].input.Item.botFilterNote, undefined, "and the note must not linger");
  } finally {
    console.warn = realWarn;
  }
});

test("a non-ok prefix response degrades exactly like a thrown fetch", async () => {
  // The !res.ok branch was never exercised, and it is the likelier failure:
  // a 503 from the CDN resolves, it does not reject.
  const { core, ddb } = makeCore({ rangesOk: () => "not-ok" });
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    const out = await core({ today: "2026-08-20" });
    assert.equal(out.botFilterComplete, false);
    assert.match(ddb.calls[0].input.Item.botFilterNote.S, /HTTP 503/);
  } finally {
    console.warn = realWarn;
  }
});

test("both network waits are bounded, not left to the function timeout", async () => {
  // A stalled connection is not a rejection the degrade path can absorb: it
  // burns the whole 120s budget and ends as an anonymous Lambda timeout, taking
  // a day the raw logs cannot give back.
  const signals = {};
  const amplify = stubClient({ GenerateAccessLogsCommand: { logUrl: "https://s3.test/presigned" } });
  const core = createAnalyticsCore({
    amplify,
    ddb: stubClient(),
    fetchImpl: async (url, init) => {
      signals[url.includes("ip-ranges") ? "ranges" : "log"] = init?.signal;
      return url.includes("ip-ranges")
        ? { ok: true, json: async () => ({ prefixes: [] }) }
        : { ok: true, text: async () => LOG };
    },
    tableName: "t",
    appId: "app",
    domain: "d",
  });
  await core({ today: "2026-08-20" });

  assert.ok(signals.ranges instanceof AbortSignal, "the prefix fetch must carry a timeout");
  assert.ok(signals.log instanceof AbortSignal, "the log download must carry a timeout");
  assert.ok(LOG_DOWNLOAD_TIMEOUT_MS > RANGES_TIMEOUT_MS, "the optional fetch gets the shorter leash");
  assert.ok(LOG_DOWNLOAD_TIMEOUT_MS + RANGES_TIMEOUT_MS < 120_000, "both must fit inside the function Timeout");
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

test("a size refusal is retried in narrower windows, not lost with the day", async () => {
  // Amplify refuses windows it considers too large, and its log retention is
  // finite — so a day that fails this way ages out and is gone for good. The
  // ops script always halved the window on this exact message; the Lambda,
  // written later against the same API, made one call and threw.
  let refusedFullDay = false;
  const amplify = {
    calls: [],
    send: async (cmd) => {
      amplify.calls.push(cmd);
      const wholeDay = cmd.input.endTime.getTime() - cmd.input.startTime.getTime() > 12 * 3600 * 1000;
      if (wholeDay && !refusedFullDay) {
        refusedFullDay = true;
        throw new Error("Unable to complete request for the given time range");
      }
      return { logUrl: `https://s3.test/${cmd.input.startTime.toISOString()}` };
    },
  };
  const ddb = stubClient();
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

  const out = await core({ today: "2026-08-20" });
  assert.ok(amplify.calls.length > 1, "the refused window must be narrowed and retried");
  assert.equal(out.day, "2026-08-19");
  assert.equal(ddb.calls.length, 1, "still exactly one row for the day");
});

test("any other Amplify failure still throws, so the errors alarm fires", async () => {
  // Narrowing must not swallow a wrong app id or a dead credential: retrying it
  // four times in smaller windows would turn a clear failure into a slow one.
  const amplify = stubClient({
    GenerateAccessLogsCommand: new Error("AccessDeniedException: amplify:GenerateAccessLogs"),
  });
  const ddb = stubClient();
  const core = createAnalyticsCore({
    amplify,
    ddb,
    fetchImpl: async () => ({ ok: true, json: async () => ({ prefixes: [] }), text: async () => LOG }),
    tableName: "t",
    appId: "app",
    domain: "d",
  });
  await assert.rejects(() => core({ today: "2026-08-20" }), /AccessDeniedException/);
  assert.equal(amplify.calls.length, 1, "a real failure is not retried");
  assert.equal(ddb.calls.length, 0);
});

test("a quiet day is recorded as zero, not skipped", async () => {
  const { core, ddb } = makeCore({ logText: HEADER });
  const out = await core({ today: "2026-08-20" });
  assert.equal(out.requests, 0);
  assert.equal(out.humans, 0);
  assert.equal(ddb.calls.length, 1, "a zero day is still a fact worth storing");
});
