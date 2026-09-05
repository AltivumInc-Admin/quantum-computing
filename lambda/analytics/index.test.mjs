import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { NOTEBOOKS, SECTIONS } from "./curriculum.mjs";
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

/**
 * A log with one reader and one declared crawler.
 *
 * The reader loads the app, reads two lesson pages and opens one notebook in
 * the lab — so the row this produces exercises the curriculum maps, and the
 * privacy pin below is asserted against a row that actually carries them. The
 * crawler asks for the same notebook and must contribute nothing.
 */
const LOG = [
  HEADER,
  "2026-08-19,10:00:00,198.51.100.4,/,200,-,Mozilla/5.0,learner.quantumenv.dev,text/html",
  "2026-08-19,10:00:01,198.51.100.4,/_next/static/x.js,200,-,Mozilla/5.0,learner.quantumenv.dev,text/javascript",
  "2026-08-19,10:01:00,198.51.100.4,/learn/00-prereqs,200,-,Mozilla/5.0,learner.quantumenv.dev,text/html",
  "2026-08-19,10:02:00,198.51.100.4,/learn/01-foundations,200,-,Mozilla/5.0,learner.quantumenv.dev,text/html",
  "2026-08-19,10:03:00,198.51.100.4,/lab/files/01-foundations/notebooks/01-first-circuit.ipynb,200,-,Mozilla/5.0,learner.quantumenv.dev,application/octet-stream",
  "2026-08-19,10:03:01,198.51.100.4,/lab/files/01-foundations/notebooks/01-first-circuit.ipynb,304,-,Mozilla/5.0,learner.quantumenv.dev,-",
  "2026-08-19,10:05:00,10.0.0.9,/,200,-,Googlebot/2.1,learner.quantumenv.dev,text/html",
  "2026-08-19,10:05:01,10.0.0.9,/lab/files/03-algorithms/notebooks/02-grovers-search.ipynb,200,-,Googlebot/2.1,learner.quantumenv.dev,application/octet-stream",
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

/**
 * The privacy promise, as an assertion — every branch that writes a row.
 *
 * README states the pin without qualification, but it only ever ran against the
 * healthy-ranges branch, and the degraded branch writes a TWELFTH attribute
 * (botFilterNote) that the allowlist had therefore never seen. A promise pinned
 * on one of two branches is not pinned.
 */
function assertCountsOnly(item) {
  const allowed = new Set([
    // offSiteRequests is a COUNT of rows whose host header was not ours
    // (rows.length - mine.length) — no address, agent or path, so it keeps the
    // promise. It is stored because `requests: 0` alone cannot distinguish a
    // quiet day from a host filter matching nothing, which is how this stack
    // recorded weeks of zeroes while every alarm stayed green.
    "day", "requests", "offSiteRequests", "uniqueIps", "humans", "humanPageViews",
    "googleSignIns", "malformed", "buckets", "botFilterComplete", "computedAt",
    // Added 2026-09-04 with the privacy amendment that discloses them. Their
    // KEYS are the reason they keep the promise: every one comes from the
    // checked-in curriculum allowlist and is already public in a lesson URL, so
    // a scanner's probe, a query string or an unreviewed future route cannot
    // become a column here. The positive assertion below is what enforces that
    // — widening the allowed set alone would not be enough.
    "notebookOpens", "sectionReach", "sectionDepth", "furthestSection",
    // botFilterNote is why the ip-ranges fetch failed — an error message from
    // our own fetch of a PUBLIC AWS document, truncated to 200 characters. It
    // describes the collector's network, never a visitor. Written only on the
    // degraded branch, which is exactly why it has to be listed here.
    "botFilterNote",
  ]);
  for (const key of Object.keys(item)) {
    assert.ok(allowed.has(key), `unexpected attribute written: ${key}`);
  }

  // Not "these keys are tolerable" but "no other key is expressible": every
  // curriculum map may only carry identifiers this repository ships.
  for (const key of Object.keys(item.notebookOpens?.M ?? {})) {
    assert.ok(NOTEBOOKS.has(key), `notebookOpens key is not a checked-in notebook: ${key}`);
  }
  for (const attr of ["sectionReach", "furthestSection"]) {
    for (const key of Object.keys(item[attr]?.M ?? {})) {
      assert.ok(SECTIONS.has(key), `${attr} key is not a checked-in section: ${key}`);
    }
  }
  for (const key of Object.keys(item.sectionDepth?.M ?? {})) {
    assert.match(key, /^[1-7]$/, `sectionDepth key must be a section count: ${key}`);
  }

  // Not just "no forbidden attribute" but "no UNDISCLOSED aggregate": run the
  // converse guard over the row this branch actually produced.
  assertEveryAggregateIsDisclosed(item);

  const written = JSON.stringify(item);
  assert.equal(written.includes("198.51.100.4"), false, "no visitor address");
  assert.equal(written.includes("10.0.0.9"), false, "no visitor address");
  assert.equal(written.includes("Googlebot"), false, "no user agent");
  assert.equal(written.includes("_next"), false, "no request path");
  assert.equal(written.includes("/lab/files/"), false, "no request path");
  assert.equal(written.includes(".ipynb"), false, "no request path");
}

/**
 * THE CONVERSE GUARD: every aggregate this row stores is disclosed in the policy.
 *
 * web/__tests__/app/privacy-page.test.tsx already asserts the other direction —
 * that a claim the policy MAKES is one the code honours. On 2026-09-04 that was
 * the whole of the coverage, and it let two attributes ship ahead of the policy:
 * `furthestSection` (WHICH section a day's readers got furthest into) and
 * `sectionReach` (how many people opened EACH section), plus `googleSignIns`,
 * which had never been disclosed at all. For a privacy policy this is the
 * direction that matters: an undisclosed collection is the defect, and an
 * undisclosed one is invisible to a test that only reads the policy.
 *
 * So each attribute below is CLASSIFIED, and the assertion is over the whole
 * attribute set, not a subset. Adding an attribute to the row without adding it
 * here fails; classifying it as `visitor` without a matching policy sentence in
 * BOTH locales fails too. That makes "store it now, disclose it later" impossible
 * to do by accident.
 */
const DISCLOSURE = {
  // Visitor behaviour: describes what people did. MUST be disclosed, and the
  // phrases are the ones the privacy copy actually uses in each locale.
  humans: { kind: "visitor", en: /how many people reached the site/i, es: /cuántas personas llegaron al sitio/i },
  googleSignIns: { kind: "visitor", en: /how many people signed in/i, es: /cuántas iniciaron sesión/i },
  notebookOpens: { kind: "visitor", en: /opened each lesson notebook/i, es: /abrieron cada cuaderno de lección/i },
  sectionReach: { kind: "visitor", en: /opened each course section/i, es: /abrieron cada sección del curso/i },
  sectionDepth: {
    kind: "visitor",
    en: /how many course sections a day's visitors reached/i,
    es: /a cuántas secciones del curso llegaron las visitas de ese día/i,
  },
  furthestSection: {
    kind: "visitor",
    en: /which section a day's readers got furthest into/i,
    es: /hasta qué sección llegaron más lejos/i,
  },
  // Covered by the same paragraph's general statement about daily totals: these
  // are volumes and collector health, not a description of any person's reading.
  // They are still enumerated so that the assertion can be over the FULL set.
  day: { kind: "operational" },
  requests: { kind: "operational" },
  offSiteRequests: { kind: "operational" },
  uniqueIps: { kind: "operational" },
  humanPageViews: { kind: "operational" },
  malformed: { kind: "operational" },
  buckets: { kind: "operational" },
  botFilterComplete: { kind: "operational" },
  botFilterNote: { kind: "operational" },
  computedAt: { kind: "operational" },
};

const POLICY = {
  en: readFileSync(new URL("../../web/src/i18n/locales/en.ts", import.meta.url), "utf8"),
  es: readFileSync(new URL("../../web/src/i18n/locales/es.ts", import.meta.url), "utf8"),
};

/**
 * Assert the classification is total and the visitor half is actually disclosed.
 * `item` is a real row, so this runs against what the code writes, not a list.
 */
function assertEveryAggregateIsDisclosed(item) {
  for (const key of Object.keys(item)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(DISCLOSURE, key),
      `attribute "${key}" is written to the daily row but is not classified in DISCLOSURE. ` +
        `Decide what it is: if it describes what a visitor did, disclose it in the privacy ` +
        `policy (storeAggregates in BOTH locales) and add its phrase here.`
    );
  }
  for (const [key, spec] of Object.entries(DISCLOSURE)) {
    if (spec.kind !== "visitor") continue;
    for (const locale of ["en", "es"]) {
      assert.match(
        POLICY[locale],
        spec[locale],
        `"${key}" is stored on every daily row but the ${locale} privacy policy does not ` +
          `disclose it. Amend storeAggregates in web/src/i18n/locales/${locale}.ts; never ` +
          `relax this test, and never drop the attribute from DISCLOSURE to make it pass.`
      );
    }
  }
}

test("every visitor aggregate the daily row stores is disclosed in both locales", () => {
  // Belt and braces against the row shape drifting away from this list: the
  // classification is also applied to a real row inside assertCountsOnly's
  // callers, but assert it here too so the failure names this rule by itself.
  assertEveryAggregateIsDisclosed(
    Object.fromEntries(Object.keys(DISCLOSURE).map((k) => [k, { N: "0" }]))
  );
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
  // The fixture is re-dated to the requested day on purpose: summarizeDay now
  // also filters on the date the rows CLAIM, so a log for another day would be
  // (correctly) reported as matching nothing and would bury this assertion in
  // an unrelated warning.
  const { core, amplify } = makeCore({ logText: LOG.replaceAll("2026-08-19", "2026-07-28") });
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

test("counts what was read as curriculum identifiers, not as paths", async () => {
  const { core, ddb } = makeCore();
  const out = await core({ today: "2026-08-20" });
  const item = ddb.calls[0].input.Item;

  // One reader, one notebook — fetched TWICE (200 then 304), counted once.
  assert.deepEqual(out.notebookOpens, { "01-foundations/01-first-circuit": 1 });
  assert.equal(item.notebookOpens.M["01-foundations/01-first-circuit"].N, "1");

  // Two lesson pages plus the notebook's own section: reach is per section,
  // depth says how much of the curriculum one day's readers covered, and
  // furthest is how deep they got. All keyed by section, valued by people.
  assert.deepEqual(out.sectionReach, { "00-prereqs": 1, "01-foundations": 1 });
  assert.deepEqual(out.sectionDepth, { 2: 1 }, "one person touched two sections");
  assert.deepEqual(out.furthestSection, { "01-foundations": 1 });

  // The declared crawler asked for a notebook too. Bot exclusion is the same
  // pass that produces `humans`, so it cannot appear here.
  assert.equal(out.notebookOpens["03-algorithms/02-grovers-search"], undefined);
  assert.equal(out.humans, 1);
  for (const n of Object.values(out.notebookOpens)) {
    assert.ok(n <= out.humans, "a notebook cannot be opened by more people than there were");
  }
});

test("the new attributes are ADDITIVE — an older row is still readable", async () => {
  // Seven rows exist from 2026-08-28 to 2026-09-03 with none of the four
  // curriculum maps, and there is deliberately no backfill: Amplify's retention
  // has already lost the raw logs behind them. So the shape a reader relied on
  // then must still be exactly present now, and ABSENT must keep meaning "not
  // collected" rather than zero — which it does only because nothing was
  // renamed, retyped or removed to make room.
  const BEFORE = {
    day: "S", requests: "N", offSiteRequests: "N", uniqueIps: "N", humans: "N",
    humanPageViews: "N", googleSignIns: "N", malformed: "N", buckets: "M",
    botFilterComplete: "BOOL", computedAt: "S",
  };
  const { core, ddb } = makeCore();
  await core({ today: "2026-08-20" });
  const item = ddb.calls[0].input.Item;

  for (const [attr, type] of Object.entries(BEFORE)) {
    assert.ok(attr in item, `${attr} vanished — an existing reader of the 7 old rows breaks`);
    assert.deepEqual(Object.keys(item[attr]), [type], `${attr} changed DynamoDB type`);
  }
  for (const attr of ["notebookOpens", "sectionReach", "sectionDepth", "furthestSection"]) {
    assert.ok(attr in item);
    assert.deepEqual(Object.keys(item[attr]), ["M"], `${attr} must be a map of counts`);
  }
});

test("a day with no lab or lesson traffic writes empty maps, not missing ones", async () => {
  // The sparse case: the maps exist and are empty, which reads as "counted, and
  // nobody opened anything" — distinct from an old row, where they are absent
  // and read as "never collected".
  const bare = [
    HEADER,
    "2026-08-19,10:00:00,198.51.100.4,/,200,-,Mozilla/5.0,learner.quantumenv.dev,text/html",
    "2026-08-19,10:00:01,198.51.100.4,/_next/static/x.js,200,-,Mozilla/5.0,learner.quantumenv.dev,text/javascript",
  ].join("\n");
  const { core, ddb } = makeCore({ logText: bare });
  await core({ today: "2026-08-20" });
  const item = ddb.calls[0].input.Item;
  assert.deepEqual(item.notebookOpens.M, {});
  assert.deepEqual(item.sectionReach.M, {});
  assertCountsOnly(item);
});

test("STORES NO IDENTIFIERS — the written item is counts only", async () => {
  // The privacy policy is the gate on this test, not the other way round. It
  // WAS rewritten, in both locales, on 2026-09-04, in the same change that
  // added the four curriculum maps: "What we store" now discloses the daily
  // counts, the grouping-by-address-then-discarding, and that nothing links one
  // day to another. If this test ever needs relaxing again, that copy needs
  // rewriting FIRST — an aggregate this row cannot express is one the policy
  // does not promise.
  const { core, ddb } = makeCore();
  await core({ today: "2026-08-20" });
  assertCountsOnly(ddb.calls[0].input.Item);
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
    assert.equal(out.offSiteRequests, 8, "but the log was not empty");
    assert.ok(
      warnings.some((w) => w.includes("analytics-matched-nothing")),
      "must emit the line the metric filter alarms on",
    );
    assert.ok(
      warnings.some((w) => w.includes("siteHost=some-other-host.example")),
      "the warning must name the host it filtered with, not a module constant",
    );
    assert.equal(ddb.calls[0].input.Item.offSiteRequests.N, "8", "diagnostic persisted on the row");
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
    // The branch that writes a twelfth attribute is a branch the privacy pin
    // has to see, not one it can take on trust.
    assertCountsOnly(ddb.calls[0].input.Item);

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

test("the prefix fetch overlaps the log retrieval instead of queuing behind it", async () => {
  // Two independent network waits, and the cron makes every run a cold start,
  // so the memo never helps and the full fetch + parse + index build is paid
  // every day. quantum-analytics-slow watches wall clock against a 120s
  // timeout, so the ordering is a monitored quantity, not a micro-optimization.
  const order = [];
  const amplify = {
    calls: [],
    send: async (cmd) => {
      amplify.calls.push(cmd);
      order.push("amplify");
      return { logUrl: "https://s3.test/presigned" };
    },
  };
  const core = createAnalyticsCore({
    amplify,
    ddb: stubClient(),
    fetchImpl: async (url) => {
      order.push(url.includes("ip-ranges") ? "ranges" : "log");
      return url.includes("ip-ranges")
        ? { ok: true, json: async () => ({ prefixes: [] }) }
        : { ok: true, text: async () => LOG };
    },
    tableName: "t",
    appId: "app",
    domain: "d",
  });
  await core({ today: "2026-08-20" });
  assert.equal(order[0], "ranges", "the prefix fetch must be in flight before Amplify is asked");
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

test("a log that cannot be READ is flagged, not recorded as a quiet day", async () => {
  // A format change that breaks every data line yields rows: [], which means no
  // error, no matched-nothing (that needs off-site rows to exist), and a row of
  // zeroes — indistinguishable from a day with no visitors. `malformed` was
  // written to the row and returned to the invoker, and read by nothing.
  const broken = [HEADER, "2026-08-19|10:00:00|198.51.100.4|/|200", "not,even,close"].join("\n");
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const { core, ddb } = makeCore({ logText: broken });
    const out = await core({ today: "2026-08-20" });
    assert.equal(out.requests, 0);
    assert.equal(out.malformed, 2);
    assert.ok(
      warnings.some((w) => w.includes("analytics-parse-degraded")),
      "must emit the line the metric filter alarms on",
    );
    assert.equal(ddb.calls[0].input.Item.malformed.N, "2", "and the evidence lands on the row");
  } finally {
    console.warn = realWarn;
  }
});

test("a handful of bad lines does NOT page — incidental damage is not a broken parse", async () => {
  // parseLog drops a line it cannot trust precisely so one bad line does not
  // cost the other 3,000. The alarm must respect the same reasoning or it
  // cries wolf, and an alarm that cries wolf is worse than none.
  const mostlyFine = [
    HEADER,
    ...Array.from({ length: 20 }, (_, i) =>
      `2026-08-19,10:00:${String(i).padStart(2, "0")},198.51.100.4,/,200,-,Mozilla/5.0,learner.quantumenv.dev,text/html`,
    ),
    "truncated,row",
  ].join("\n");
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const { core } = makeCore({ logText: mostlyFine });
    const out = await core({ today: "2026-08-20" });
    assert.equal(out.malformed, 1);
    assert.ok(out.requests > 0);
    assert.equal(warnings.some((w) => w.includes("analytics-parse-degraded")), false);
  } finally {
    console.warn = realWarn;
  }
});

test("a quiet day is recorded as zero, not skipped", async () => {
  const { core, ddb } = makeCore({ logText: HEADER });
  const out = await core({ today: "2026-08-20" });
  assert.equal(out.requests, 0);
  assert.equal(out.humans, 0);
  assert.equal(ddb.calls.length, 1, "a zero day is still a fact worth storing");
});
