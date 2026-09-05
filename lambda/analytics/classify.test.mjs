/**
 * Tests for the traffic classifier.
 *
 * The fixtures are REAL CloudFront rows captured from this site's own access
 * logs on 2026-08-16 and 2026-08-19, not invented ones. Three of them encode
 * false positives that a naive classifier produced during the 2026-08-20
 * investigation; each is pinned here so the mistake cannot come back.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  CALLBACK_PATH,
  SITE_HOST,
  buildRangeIndex,
  classifyVisitor,
  googleSignIns,
  inRangeIndex,
  ipToBigInt,
  isDeclaredBot,
  isHostilePath,
  isPageView,
  notebookKey,
  parseLog,
  sectionOf,
  summarizeDay,
  verifiedGoogleSignIns,
} from "./classify.mjs";
import { NOTEBOOKS, SECTIONS } from "./curriculum.mjs";

/** The real CloudFront CSV header, verbatim — note the escaped parentheses. */
const HEADER =
  "date,time,x-edge-location,sc-bytes,c-ip,cs-method,cs\\(Host),cs-uri-stem,sc-status," +
  "cs\\(Referer),cs\\(User-Agent),cs-uri-query,cs\\(Cookie),x-edge-result-type," +
  "x-edge-request-id,x-host-header,cs-protocol,cs-bytes,time-taken,x-forwarded-for," +
  "ssl-protocol,ssl-cipher,x-edge-response-result-type,cs-protocol-version,fle-status," +
  "fle-encrypted-fields,c-port,time-to-first-byte,x-edge-detailed-result-type," +
  "sc-content-type,sc-content-len,sc-range-start,sc-range-end";

const CHROME_MAC =
  "Mozilla/5.0%20\\(Macintosh;%20Intel%20Mac%20OS%20X%2010_15_7)%20AppleWebKit/537.36" +
  "%20\\(KHTML%20like%20Gecko)%20Chrome/151.0.0.0%20Safari/537.36";

/** Build one CSV row in the real column order. */
function row({
  date = "2026-08-19",
  time = "12:00:00",
  ip = "203.0.113.10",
  path = "/",
  status = "200",
  referer = "-",
  ua = CHROME_MAC,
  host = "learner.quantumenv.dev",
  contentType = "text/html",
} = {}) {
  const f = new Array(33).fill("-");
  f[0] = date;
  f[1] = time;
  f[4] = ip;
  f[7] = path;
  f[8] = status;
  f[9] = referer;
  f[10] = ua;
  f[15] = host;
  f[29] = contentType;
  return f.join(",");
}

const logOf = (...rows) => [HEADER, ...rows].join("\n");
const parse = (...rows) => parseLog(logOf(...rows)).rows;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test("parses the real CloudFront header, escaped parentheses and all", () => {
  const real =
    "2026-08-16,16:25:50,BNA50-P1,6110,203.0.113.40,GET,d47zhgcam9txj.cloudfront.net," +
    "/auth/callback,200,https://accounts.google.com/," +
    CHROME_MAC +
    ",code\\=REDACTED&state\\=REDACTED,-,Miss,x_XaI0l,learner.quantumenv.dev,https,827,0.093,-," +
    "TLSv1.3,TLS_AES_128_GCM_SHA256,Miss,HTTP/3.0,-,-,60221,0.093,Miss,text/html,-,-,-";
  const { rows, malformed } = parseLog(logOf(real));

  assert.equal(malformed, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ip, "203.0.113.40");
  assert.equal(rows[0].path, "/auth/callback");
  assert.equal(rows[0].status, "200");
  assert.equal(rows[0].referer, "https://accounts.google.com/");
  assert.equal(rows[0].host, "learner.quantumenv.dev");
  assert.equal(rows[0].contentType, "text/html");
  assert.match(rows[0].ua, /^Mozilla\/5\.0 \(Macintosh/, "percent-escapes must be decoded");
});

test("resolves 'time' to the time column, not time-taken or time-to-first-byte", () => {
  // Substring matching alone would bind whichever appears first. The real
  // header carries all three; a mis-bind would make every timestamp unparseable
  // and silently drop the whole day as malformed.
  const rows = parse(row({ time: "07:08:09" }));
  assert.equal(rows.length, 1);
  assert.equal(new Date(rows[0].ts).toISOString(), "2026-08-19T07:08:09.000Z");
});

test("counts malformed rows instead of throwing, so one bad line cannot cost a day", () => {
  const { rows, malformed } = parseLog(logOf(row(), "truncated,row", row()));
  assert.equal(rows.length, 2);
  assert.equal(malformed, 1);
});

test("throws when an expected column is absent, rather than reporting a quiet day", () => {
  assert.throws(
    () => parseLog("date,time,c-ip\n2026-08-19,12:00:00,203.0.113.10"),
    /missing expected column/,
  );
});

test("an empty log is zero rows, not an error", () => {
  assert.deepEqual(parseLog(""), { rows: [], malformed: 0 });
});

// ---------------------------------------------------------------------------
// IP ranges
// ---------------------------------------------------------------------------

test("converts IPv4 and compressed IPv6, and rejects nonsense", () => {
  assert.equal(ipToBigInt("0.0.0.0"), 0n);
  assert.equal(ipToBigInt("255.255.255.255"), 4294967295n);
  assert.equal(ipToBigInt("::1"), 1n);
  assert.equal(ipToBigInt("2804:389:52:b5a3:0:27:a48c:c301") > 0n, true);
  assert.equal(ipToBigInt("256.0.0.1"), null);
  assert.equal(ipToBigInt("not-an-ip"), null);
  assert.equal(ipToBigInt(""), null);
});

test("matches an address inside an AWS-shaped prefix list, and at both boundaries", () => {
  const index = buildRangeIndex({
    prefixes: [{ ip_prefix: "52.94.76.0/22" }],
    ipv6_prefixes: [{ ipv6_prefix: "2600:1f00::/24" }],
  });
  assert.equal(index.size, 2);
  assert.equal(inRangeIndex(index, "52.94.76.0"), true, "first address in range");
  assert.equal(inRangeIndex(index, "52.94.79.255"), true, "last address in range");
  assert.equal(inRangeIndex(index, "52.94.75.255"), false, "one below");
  assert.equal(inRangeIndex(index, "52.94.80.0"), false, "one above");
  assert.equal(inRangeIndex(index, "2600:1f00::5"), true);
  assert.equal(inRangeIndex(index, "203.0.113.1"), false);
});

test("accepts a bare CIDR array so a second cloud provider needs no new code path", () => {
  const index = buildRangeIndex(["34.122.0.0/16"], { prefixes: [{ ip_prefix: "3.0.0.0/8" }] });
  // 34.122.x.x is the Google Cloud address that slipped through when only AWS
  // ranges were checked during the investigation.
  assert.equal(inRangeIndex(index, "34.122.55.1"), true);
  assert.equal(inRangeIndex(index, "3.94.1.1"), true);
});

// ---------------------------------------------------------------------------
// The three pinned false positives
// ---------------------------------------------------------------------------

test("REGRESSION: a scanner carrying an ordinary browser user-agent is still a scanner", () => {
  // Real row, 2026-08-19. The user-agent is unremarkable; only the path betrays it.
  const rows = parse(
    row({ ip: "172.69.150.110", path: "/wp-admin/install.php", status: "404" }),
    row({ ip: "172.69.150.110", path: "/", status: "200" }),
    row({ ip: "172.69.150.110", path: "/_next/static/chunks/x.js", contentType: "text/javascript" }),
  );
  assert.equal(isDeclaredBot(rows[0].ua), false, "the UA alone gives nothing away");
  assert.equal(classifyVisitor(rows, null), "scanner");
});

test("REGRESSION: loading real app assets does not make a 260-pages/minute crawler human", () => {
  // Six addresses did exactly this and passed a browser-behaviour check.
  const rows = [];
  for (let i = 0; i < 56; i++) {
    rows.push(row({ ip: "54.223.0.1", path: `/glossary/term-${i}`, time: "03:32:00" }));
  }
  rows.push(
    row({
      ip: "54.223.0.1",
      path: "/_next/static/chunks/x.js",
      time: "03:32:01",
      contentType: "text/javascript",
    }),
  );
  const parsed = parse(...rows);
  assert.equal(parsed.filter(isPageView).length, 56);
  assert.equal(classifyVisitor(parsed, null), "high-rate");
});

test("REGRESSION: one page plus its stylesheet a second later is a reader, not 60 pages/minute", () => {
  // The arithmetic that convicted this visitor divided 1 page by a 1-second
  // span. Rate needs intervals between PAGES, and one page has none.
  const rows = parse(
    row({ ip: "198.51.100.4", path: "/", time: "18:31:00" }),
    row({
      ip: "198.51.100.4",
      path: "/_next/static/chunks/x.css",
      time: "18:31:01",
      contentType: "text/css",
    }),
  );
  assert.equal(classifyVisitor(rows, null), "human");
});

test("REGRESSION: 442 pages at 0.9/minute passes a rate test and is still not a person", () => {
  // Real shape: one address, eight hours, sustained slow crawl.
  const rows = [];
  for (let i = 0; i < 442; i++) {
    const minute = i % 60;
    const hour = 8 + Math.floor(i / 60);
    rows.push(
      row({
        ip: "52.23.0.9",
        path: `/learn/page-${i}`,
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
      }),
    );
  }
  rows.push(row({ ip: "52.23.0.9", path: "/_next/static/chunks/x.js", contentType: "text/javascript" }));
  assert.equal(classifyVisitor(parse(...rows), null), "high-volume");
});

// ---------------------------------------------------------------------------
// Who does survive
// ---------------------------------------------------------------------------

test("an ordinary reading session survives every filter", () => {
  const rows = parse(
    row({ ip: "198.51.100.4", path: "/", time: "18:31:00" }),
    row({ ip: "198.51.100.4", path: "/_next/static/chunks/x.js", time: "18:31:01", contentType: "text/javascript" }),
    row({ ip: "198.51.100.4", path: "/learn/01-foundations", time: "18:34:00" }),
    row({ ip: "198.51.100.4", path: "/glossary/qubit", time: "18:41:00" }),
  );
  assert.equal(classifyVisitor(rows, buildRangeIndex([])), "human");
});

test("a datacenter address is dropped even when it behaves perfectly", () => {
  const index = buildRangeIndex(["52.23.0.0/16"]);
  const rows = parse(
    row({ ip: "52.23.0.9", path: "/", time: "10:00:00" }),
    row({ ip: "52.23.0.9", path: "/_next/static/chunks/x.js", time: "10:00:01", contentType: "text/javascript" }),
    row({ ip: "52.23.0.9", path: "/pricing", time: "10:05:00" }),
  );
  assert.equal(classifyVisitor(rows, index), "datacenter");
});

test("a visitor who never loads app assets is not counted", () => {
  const rows = parse(row({ ip: "198.51.100.7", path: "/", time: "10:00:00" }));
  assert.equal(classifyVisitor(rows, null), "no-assets");
});

test("a burst inside one second is a rate, not a division by zero", () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(row({ ip: "198.51.100.8", path: `/p${i}`, time: "10:00:00" }));
  rows.push(row({ ip: "198.51.100.8", path: "/_next/static/x.js", time: "10:00:00", contentType: "text/javascript" }));
  const verdict = classifyVisitor(parse(...rows), null);
  assert.equal(verdict, "high-rate");
});

test("declared crawlers are caught by their user-agent", () => {
  for (const ua of ["Googlebot/2.1", "Go-http-client/1.1", "python-requests/2.31", "ClaudeBot/1.0"]) {
    assert.equal(isDeclaredBot(ua), true, ua);
  }
  assert.equal(isDeclaredBot(CHROME_MAC.replace(/%20/g, " ")), false);
});

test("no route this site serves is classified hostile", () => {
  // Derived from the app directory, not hardcoded, so a new route is covered
  // the moment it exists. /credentials was matched by an early version of
  // HOSTILE_PATH; because that rule convicts the whole visitor, it erased two
  // real readers who had just signed in with Google.
  const appDir = new URL("../../web/src/app/", import.meta.url);
  const routes = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const route = `${prefix}/${entry.name}`;
      if (existsSync(new URL(`.${route}/page.tsx`, appDir))) routes.push(route);
      walk(new URL(`.${route}/`, appDir), route);
    }
  };
  walk(appDir, "");

  assert.ok(routes.length > 10, `expected to find the app's routes, found ${routes.length}`);
  for (const route of routes) {
    // Dynamic segments stand in for a plausible real value.
    const concrete = route.replace(/\[[^\]]+\]/g, "sample");
    assert.equal(isHostilePath(concrete), false, `${concrete} is a real route and must not be hostile`);
  }
});

test("hostile paths are recognized, ordinary curriculum paths are not", () => {
  for (const p of ["/wp-admin/install.php", "/.env", "/.git/config", "/actuator/health"]) {
    assert.equal(isHostilePath(p), true, p);
  }
  for (const p of ["/learn/03-algorithms", "/glossary/qubit", "/changelog", "/auth/callback"]) {
    assert.equal(isHostilePath(p), false, p);
  }
});

// ---------------------------------------------------------------------------
// Google sign-in extraction
// ---------------------------------------------------------------------------

test("finds the Google sign-in that really happened on 2026-08-16", () => {
  const rows = parse(
    row({
      date: "2026-08-16",
      time: "16:25:50",
      ip: "203.0.113.40",
      path: CALLBACK_PATH,
      status: "200",
      referer: "https://accounts.google.com/",
    }),
  );
  assert.equal(googleSignIns(rows).length, 1);
});

test("does not count a callback that did not come from Google", () => {
  const rows = parse(
    // Same route, reached by in-app navigation — seen in the real 2026-07-28 log.
    row({ path: CALLBACK_PATH, status: "200", referer: "https://learner.quantumenv.dev/" }),
    // A referer that merely mentions Google must not match.
    row({ path: CALLBACK_PATH, status: "200", referer: "https://evil.test/?x=accounts.google.com/" }),
    // The route, but not a completed load.
    row({ path: CALLBACK_PATH, status: "404", referer: "https://accounts.google.com/" }),
  );
  assert.equal(googleSignIns(rows).length, 0);
});

// ---------------------------------------------------------------------------
// Day summary
// ---------------------------------------------------------------------------

test("summarizes a day, reporting every bucket rather than a bare total", () => {
  const rows = parse(
    row({ ip: "172.69.150.110", path: "/wp-admin/install.php", status: "404" }),
    row({ ip: "10.0.0.5", path: "/", ua: "Googlebot/2.1" }),
    row({ ip: "198.51.100.4", path: "/", time: "18:31:00" }),
    row({ ip: "198.51.100.4", path: "/_next/static/x.js", time: "18:31:01", contentType: "text/javascript" }),
    row({ ip: "203.0.113.40", path: CALLBACK_PATH, referer: "https://accounts.google.com/" }),
    row({ ip: "203.0.113.40", path: "/_next/static/x.js", contentType: "text/javascript" }),
  );
  const s = summarizeDay(rows, buildRangeIndex([]), { day: "2026-08-19" });

  assert.equal(s.day, "2026-08-19");
  assert.equal(s.uniqueIps, 4);
  assert.equal(s.buckets.scanner, 1);
  assert.equal(s.buckets["declared-bot"], 1);
  assert.equal(s.humans, 2);
  assert.equal(s.googleSignIns, 1);
  // The buckets must account for every address seen.
  const counted = Object.values(s.buckets).reduce((a, b) => a + b, 0);
  assert.equal(counted, s.uniqueIps, "every visitor lands in exactly one bucket");
});

test("traffic to another host header is excluded and reported separately", () => {
  const rows = parse(
    row({ ip: "203.0.113.55", path: "/", host: "d47zhgcam9txj.cloudfront.net" }),
    row({ ip: "198.51.100.4", path: "/" }),
  );
  const s = summarizeDay(rows, buildRangeIndex([]));
  assert.equal(s.requests, 1);
  assert.equal(s.offSiteRequests, 1);
});

test("the host filter is an argument, so one caller can replay two hostnames", () => {
  // The value whose staleness zeroed this report for weeks must be varyable per
  // call: the daily run passes the deployed SiteHost, and backfill.mjs passes
  // whatever hostname the site served on the day it is replaying.
  const rows = parse(
    row({ ip: "198.51.100.4", path: "/", host: "quantum.altivum.ai" }),
    row({ ip: "198.51.100.5", path: "/" }),
  );

  const now = summarizeDay(rows, buildRangeIndex([]));
  assert.equal(now.requests, 1, "the default is the canonical host");
  assert.equal(now.offSiteRequests, 1);

  const then = summarizeDay(rows, buildRangeIndex([]), { siteHost: "quantum.altivum.ai" });
  assert.equal(then.requests, 1, "the pre-cutover host selects the pre-cutover rows");
  assert.equal(then.offSiteRequests, 1);
});

test("SITE_HOST is a plain constant — classify.mjs reads no environment", () => {
  // The header promises (data in) -> (data out). A module-scope process.env read
  // makes the one value that matters most impossible for a caller to vary, and
  // is why index.test.mjs used to rewrite its own fixture to test a wrong host.
  const src = readFileSync(new URL("./classify.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /process\.env/, "env reads belong at the composition root");
  assert.equal(typeof SITE_HOST, "string");
});

test("a visitor who completed a Google sign-in is human, whatever the heuristics say", () => {
  // A day cannot honestly report three Google sign-ins and fewer humans than
  // signers. Proof of a person outranks behavioural inference.
  const rows = parse(
    row({ ip: "203.0.113.40", path: CALLBACK_PATH, referer: "https://accounts.google.com/", time: "17:02:48" }),
    // The corroboration a forged Referer cannot supply: the hosted-UI redirect
    // lands in a browser, which boots the app from the same address.
    row({ ip: "203.0.113.40", path: "/_next/static/x.js", time: "17:02:48", contentType: "text/javascript" }),
    ...Array.from({ length: 60 }, (_, i) =>
      row({ ip: "203.0.113.40", path: `/glossary/t${i}`, time: "17:02:49" }),
    ),
  );
  // Fast enough to be caught by the rate rule, and read far too fast for a
  // person — the sign-in still outranks both.
  assert.equal(classifyVisitor(rows, buildRangeIndex([])), "human");
});

test("a Referer alone does not buy a verdict — the header is written by the client", () => {
  // /auth/callback is a real prerendered page in the static export, so a bare
  // GET carrying `Referer: https://accounts.google.com/` returns 200 with no
  // auth involved. When that header outranked everything, one forged row bought
  // a datacenter crawler a human verdict AND inflated the only Google sign-in
  // figure this account has.
  const forged = parse(
    row({ ip: "198.51.100.77", path: CALLBACK_PATH, referer: "https://accounts.google.com/", time: "17:02:48" }),
    ...Array.from({ length: 60 }, (_, i) =>
      row({ ip: "198.51.100.77", path: `/glossary/t${i}`, time: "17:02:49" }),
    ),
  );
  assert.equal(classifyVisitor(forged, buildRangeIndex([])), "no-assets", "nothing corroborates the header");
  assert.equal(verifiedGoogleSignIns(forged, buildRangeIndex([])).length, 0, "and it is not a sign-in either");

  // Same forgery from a published cloud range, this time with the asset fetch:
  // the strongest signal in the file must not be outranked by a header.
  const fromCloud = parse(
    row({ ip: "10.0.0.9", path: CALLBACK_PATH, referer: "https://accounts.google.com/" }),
    row({ ip: "10.0.0.9", path: "/_next/static/x.js", contentType: "text/javascript" }),
  );
  const index = buildRangeIndex(["10.0.0.0/8"]);
  assert.equal(classifyVisitor(fromCloud, index), "datacenter");
  assert.equal(verifiedGoogleSignIns(fromCloud, index).length, 0);
});

test("the day's sign-in count is corroborated too, not just the verdict", () => {
  const rows = parse(
    // Real: signed in, and the browser booted the app.
    row({ ip: "203.0.113.40", path: CALLBACK_PATH, referer: "https://accounts.google.com/" }),
    row({ ip: "203.0.113.40", path: "/_next/static/x.js", contentType: "text/javascript" }),
    // Forged: the header, and nothing else.
    row({ ip: "198.51.100.77", path: CALLBACK_PATH, referer: "https://accounts.google.com/" }),
  );
  const s = summarizeDay(rows, buildRangeIndex([]), { day: "2026-08-19" });
  assert.equal(s.googleSignIns, 1, "one corroborated sign-in, not two");
  assert.ok(s.googleSignIns <= s.humans, "a day may never report more signers than humans");
});

test("signing in does not launder a visitor that also probed hostile paths", () => {
  const rows = parse(
    row({ ip: "198.51.100.9", path: CALLBACK_PATH, referer: "https://accounts.google.com/" }),
    row({ ip: "198.51.100.9", path: "/.env", status: "404" }),
  );
  assert.equal(classifyVisitor(rows, null), "scanner");
});

// ---------------------------------------------------------------------------
// What was read — per-notebook opens and how far a day's readers got
// ---------------------------------------------------------------------------

test("a notebook fetch is recognized on a 200 AND on a 304 revalidation", () => {
  // The 304 is not an edge case: JupyterLite fetches the same notebook twice on
  // every open, and the second carries NO sc-content-type at all (the column
  // arrives as "-"). A predicate written on content-type — the way isPageView
  // is — silently drops every repeat open, which is why this one reads status.
  const [ok, revalidated] = parse(
    row({ path: "/lab/files/01-foundations/notebooks/01-first-circuit.ipynb", contentType: "application/octet-stream" }),
    row({ path: "/lab/files/01-foundations/notebooks/01-first-circuit.ipynb", status: "304", contentType: "-" }),
  );
  assert.equal(notebookKey(ok), "01-foundations/01-first-circuit");
  assert.equal(notebookKey(revalidated), "01-foundations/01-first-circuit");
  assert.equal(sectionOf(ok), "01-foundations", "a notebook load is section evidence too");
});

test("a path outside the checked-in curriculum can never become a key", () => {
  // The whole reason the privacy promise survives per-notebook counting: what
  // may be WRITTEN is bounded by curriculum.mjs, not by what a visitor can make
  // the CDN log. A probe, a rename, an unreviewed future route — all null.
  const cases = [
    "/lab/files/01-foundations/notebooks/does-not-exist.ipynb",
    "/lab/files/99-not-a-section/notebooks/01-first-circuit.ipynb",
    "/lab/files/01-foundations/notebooks/../../../etc/passwd.ipynb",
    "/lab/files/01-foundations/notebooks/01-first-circuit.ipynb?x=1",
    "/lab/api/contents/01-foundations/notebooks/all.json",
    "/lab/build/x.js",
    "/wp-admin/install.php",
  ];
  for (const path of cases) {
    const [r] = parse(row({ path, contentType: "application/octet-stream" }));
    assert.equal(notebookKey(r), null, path);
  }
  // A 404 probe for a real notebook path is a request, not a read.
  const [missing] = parse(
    row({ path: "/lab/files/01-foundations/notebooks/01-first-circuit.ipynb", status: "404" }),
  );
  assert.equal(notebookKey(missing), null);
});

test("a lesson page counts as section reach; its RSC prefetch does not", () => {
  // Next.js prefetches every in-viewport link, so on a five-reader day all seven
  // sections carried ten of these each. Counting them would report that everyone
  // reached everything — the one signal here that fails toward OVER-counting.
  const [page, prefetch, subpath] = parse(
    row({ path: "/learn/03-algorithms" }),
    row({ path: "/learn/03-algorithms/__next.abc123.txt", contentType: "text/plain" }),
    row({ path: "/learn/03-algorithms/_tree.txt", contentType: "text/plain" }),
  );
  assert.equal(sectionOf(page), "03-algorithms");
  assert.equal(sectionOf(prefetch), null);
  assert.equal(sectionOf(subpath), null);
  const [unknown] = parse(row({ path: "/learn/99-not-a-section" }));
  assert.equal(sectionOf(unknown), null);
});

test("one person opening one notebook twice is counted once", () => {
  const rows = parse(
    row({ ip: "198.51.100.4", path: "/", time: "10:00:00" }),
    row({ ip: "198.51.100.4", path: "/_next/static/x.js", time: "10:00:01", contentType: "text/javascript" }),
    row({ ip: "198.51.100.4", path: "/lab/files/00-prereqs/notebooks/01-python-numpy-warmup.ipynb", time: "10:01:00", contentType: "application/octet-stream" }),
    row({ ip: "198.51.100.4", path: "/lab/files/00-prereqs/notebooks/01-python-numpy-warmup.ipynb", time: "10:01:01", status: "304", contentType: "-" }),
  );
  const s = summarizeDay(rows, buildRangeIndex([]), { day: "2026-08-19" });
  assert.deepEqual(s.notebookOpens, { "00-prereqs/01-python-numpy-warmup": 1 });
  assert.equal(s.humans, 1);
});

test("a crawler sweeping every notebook contributes nothing", () => {
  // Real traffic: 56 requests from one address with curl/8.7.1 fetching all 45
  // notebooks in ten seconds. Bot exclusion is REUSED here — the counts are
  // taken inside the same loop, gated on the same verdict — so this can only
  // fail if classifyVisitor itself does, never because a second classifier
  // drifted from the first.
  const rows = [];
  for (const key of NOTEBOOKS) {
    rows.push(row({ ip: "203.0.113.99", ua: "curl/8.7.1", path: `/lab/files/${key.replace("/", "/notebooks/")}.ipynb`, contentType: "application/octet-stream" }));
  }
  const s = summarizeDay(parse(...rows), buildRangeIndex([]), { day: "2026-08-19" });
  assert.equal(s.buckets["declared-bot"], 1);
  assert.equal(s.humans, 0);
  assert.deepEqual(s.notebookOpens, {});
  assert.deepEqual(s.sectionReach, {});
});

test("progression is counted per person as a SET, never as an order", () => {
  const reader = (ip, ...paths) => [
    row({ ip, path: "/", time: "09:00:00" }),
    row({ ip, path: "/_next/static/x.js", time: "09:00:01", contentType: "text/javascript" }),
    ...paths.map((path, i) => row({ ip, path, time: `09:0${i + 1}:00` })),
  ];
  const rows = parse(
    // Reads 00 only.
    ...reader("198.51.100.1", "/learn/00-prereqs"),
    // Reads 03 first, then 00 — the same SET as the next reader, deliberately.
    ...reader("198.51.100.2", "/learn/03-algorithms", "/learn/00-prereqs"),
    ...reader("198.51.100.3", "/learn/00-prereqs", "/learn/03-algorithms"),
  );
  const s = summarizeDay(rows, buildRangeIndex([]), { day: "2026-08-19" });

  assert.equal(s.humans, 3);
  assert.deepEqual(s.sectionReach, { "00-prereqs": 3, "03-algorithms": 2 });
  assert.deepEqual(s.sectionDepth, { 1: 1, 2: 2 }, "one reader saw one section, two saw two");
  assert.deepEqual(s.furthestSection, { "00-prereqs": 1, "03-algorithms": 2 });
  // No value may exceed the number of people counted that day.
  for (const map of [s.sectionReach, s.sectionDepth, s.furthestSection, s.notebookOpens]) {
    for (const n of Object.values(map)) assert.ok(n <= s.humans);
  }
});

test("a wrong-window response is a gap, not a mislabelled row", () => {
  // Amplify's GenerateAccessLogs was observed under concurrency returning
  // another in-flight call's window: a fetch for 2026-09-01 came back
  // byte-identical to 09-02, every date column reading 09-02, and the tool
  // printed a plausible row and exited 0. The rows say which day they are, so
  // naming a day now filters on it — and the mismatch surfaces as the
  // already-alarmed requests: 0 with offSiteRequests > 0.
  const rows = parse(
    row({ date: "2026-09-02", ip: "198.51.100.4", path: "/" }),
    row({ date: "2026-09-02", ip: "198.51.100.4", path: "/_next/static/x.js", contentType: "text/javascript" }),
  );
  const wrong = summarizeDay(rows, buildRangeIndex([]), { day: "2026-09-01" });
  assert.equal(wrong.requests, 0);
  assert.equal(wrong.offSiteRequests, 2, "the shape the matched-nothing alarm fires on");
  assert.equal(wrong.humans, 0);

  const right = summarizeDay(rows, buildRangeIndex([]), { day: "2026-09-02" });
  assert.equal(right.requests, 2);
  assert.equal(right.humans, 1);

  // With no day named — the test and ops path — nothing is filtered by date.
  assert.equal(summarizeDay(rows, buildRangeIndex([])).requests, 2);
});

test("summarizeDay hands back curriculum maps, never a path or an address", () => {
  const rows = parse(
    row({ ip: "198.51.100.4", path: "/" }),
    row({ ip: "198.51.100.4", path: "/_next/static/x.js", contentType: "text/javascript" }),
    row({ ip: "198.51.100.4", path: "/lab/files/05-quantum-chemistry/notebooks/03-vqe-h2.ipynb", contentType: "application/octet-stream" }),
  );
  const s = summarizeDay(rows, buildRangeIndex([]), { day: "2026-08-19" });
  const written = JSON.stringify({
    notebookOpens: s.notebookOpens,
    sectionReach: s.sectionReach,
    sectionDepth: s.sectionDepth,
    furthestSection: s.furthestSection,
  });
  assert.equal(written.includes("198.51.100.4"), false);
  assert.equal(written.includes("/lab/"), false);
  assert.equal(written.includes(".ipynb"), false);
  for (const key of Object.keys(s.notebookOpens)) assert.ok(NOTEBOOKS.has(key));
  for (const key of Object.keys(s.sectionReach)) assert.ok(SECTIONS.has(key));
});
