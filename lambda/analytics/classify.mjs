/**
 * Of the traffic that reached this site, how much of it was a person?
 *
 * On 2026-08-20 the question "how many users do we have?" took an afternoon of
 * ad-hoc AWS calls and still produced a number that needed qualifying three
 * times. Along the way three plausible answers turned out to be wrong, and each
 * one is now a rule below rather than a lesson someone has to relearn:
 *
 *   - USER-AGENT ALONE FAILS. 19 requests to /wp-admin/install.php arrived
 *     carrying ordinary mobile user-agents. Scanners spoof SM-G900P, Nexus 5
 *     and Pixel 2 — those exact device strings are the stock fakes.
 *   - ASSET-LOADING ALONE FAILS. Six addresses fetched HTML *and* the
 *     _next/static chunks, which is what a real browser engine does and what a
 *     curl-based scraper cannot fake. They were reading at 100-260 pages per
 *     minute.
 *   - RATE ALONE FAILS. One address read 442 pages at 0.9 pages/minute over
 *     eight hours — slow enough to pass any rate test, far too much for a
 *     person.
 *
 * So a visitor is counted human only after surviving EVERY signal, and the
 * caller is handed the per-filter counts so the number can be audited instead
 * of trusted. Fail toward NOT counting: an uncertain visitor is dropped, so the
 * human count is a floor and never an inflated headline.
 *
 * ONE RESIDUAL, recorded rather than papered over. The Google sign-in signal
 * reads a Referer, and a Referer is written by the client — so a forger who
 * also fetches a _next/static chunk from a non-cloud address can still be
 * counted as one person. That costs a real browser or a headless one driven
 * from a residential address, which is a different class of effort from
 * curl -H, and every other signal still applies. The count is a floor against
 * accident and ordinary crawling, not against a determined forger.
 *
 * Pure and dependency-free, mirroring scripts/changelog/rules.mjs: no fs, no
 * network, no process.exit, no AWS. Everything here is (data in) -> (data out)
 * so classify.test.mjs can exercise it with no fixtures on disk. The runner
 * (backfill.mjs) owns every side effect.
 */

import { NOTEBOOKS, SECTIONS, sectionIndex } from "./curriculum.mjs";

// ---------------------------------------------------------------------------
// Log parsing
// ---------------------------------------------------------------------------

/**
 * CloudFront's CSV header escapes parentheses — the User-Agent column arrives
 * literally as `cs\(User-Agent)`. Matching on a substring rather than the exact
 * spelling means a change to that escaping does not silently produce a column
 * of undefined, which would classify every visitor as a non-bot.
 */
const COLUMNS = {
  date: "date",
  time: "time",
  ip: "c-ip",
  path: "cs-uri-stem",
  status: "sc-status",
  contentType: "sc-content-type",
  host: "x-host-header",
  ua: "User-Agent",
  referer: "Referer",
};

/** Field values are percent-encoded; %20 for space, and commas are stripped. */
function decode(value) {
  if (!value || value === "-") return "";
  try {
    return decodeURIComponent(value.replace(/\\/g, ""));
  } catch {
    // A malformed escape must not take down a whole day's parse.
    return value.replace(/\\/g, "");
  }
}

/**
 * Parse a CloudFront access-log CSV into normalized rows.
 *
 * Returns { rows, malformed } rather than throwing. A day's log is operational
 * data we do not control, and one bad line must never cost the other 3,000 —
 * but the count is surfaced so a systematically broken parse cannot masquerade
 * as a quiet day.
 */
export function parseLog(csvText) {
  const lines = String(csvText ?? "").split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], malformed: 0 };

  const header = lines[0].split(",");
  const index = {};
  for (const [key, needle] of Object.entries(COLUMNS)) {
    // Exact match wins. Substring is the fallback that survives the escaped
    // spellings (`cs\(User-Agent)`), but on its own it would resolve "time" to
    // whichever of time / time-taken / time-to-first-byte appears first — a
    // silent mis-read if CloudFront ever reorders its columns.
    const exact = header.findIndex((h) => h === needle);
    index[key] = exact === -1 ? header.findIndex((h) => h.includes(needle)) : exact;
  }

  const missing = Object.entries(index).filter(([, i]) => i === -1).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`access log is missing expected column(s): ${missing.join(", ")}`);
  }

  const rows = [];
  let malformed = 0;
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    // A short row is truncated; a long one means a value contained a comma and
    // the column offsets can no longer be trusted. Neither is guessable.
    if (f.length !== header.length) {
      malformed++;
      continue;
    }
    const date = f[index.date];
    const time = f[index.time];
    const ts = Date.parse(`${date}T${time}Z`);
    if (Number.isNaN(ts)) {
      malformed++;
      continue;
    }
    rows.push({
      ts,
      date,
      ip: f[index.ip],
      path: decode(f[index.path]),
      status: f[index.status],
      contentType: f[index.contentType] ?? "",
      host: f[index.host],
      ua: decode(f[index.ua]),
      referer: decode(f[index.referer]),
    });
  }
  return { rows, malformed };
}

// ---------------------------------------------------------------------------
// IP ranges — the strongest single signal
// ---------------------------------------------------------------------------

/** An IPv4 or IPv6 address as a BigInt, or null if it is neither. */
export function ipToBigInt(ip) {
  if (typeof ip !== "string" || ip.length === 0) return null;

  if (ip.includes(":")) {
    const [head, tail] = ip.split("::");
    const headParts = head ? head.split(":").filter(Boolean) : [];
    const tailParts = tail ? tail.split(":").filter(Boolean) : [];
    if (tail === undefined && headParts.length !== 8) return null;
    const fill = 8 - headParts.length - tailParts.length;
    if (fill < 0) return null;
    const parts = [...headParts, ...Array(fill).fill("0"), ...tailParts];
    let out = 0n;
    for (const p of parts) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
      out = (out << 16n) | BigInt(parseInt(p, 16));
    }
    return out;
  }

  const octets = ip.split(".");
  if (octets.length !== 4) return null;
  let out = 0n;
  for (const o of octets) {
    if (!/^\d{1,3}$/.test(o)) return null;
    const n = Number(o);
    if (n > 255) return null;
    out = (out << 8n) | BigInt(n);
  }
  return out;
}

/**
 * Build a searchable index from cloud-provider prefix lists.
 *
 * Accepts AWS's ip-ranges.json shape ({ prefixes: [{ip_prefix }],
 * ipv6_prefixes: [{ipv6_prefix}] }) and a plain array of CIDR strings, so a
 * second provider can be added without a new code path. Ranges are stored
 * sorted so lookup is a binary search rather than a scan of ~10,000 prefixes
 * for every address on every day.
 */
export function buildRangeIndex(...sources) {
  const cidrs = [];
  for (const src of sources) {
    if (!src) continue;
    if (Array.isArray(src)) {
      cidrs.push(...src);
      continue;
    }
    for (const p of src.prefixes ?? []) if (p.ip_prefix) cidrs.push(p.ip_prefix);
    for (const p of src.ipv6_prefixes ?? []) if (p.ipv6_prefix) cidrs.push(p.ipv6_prefix);
  }

  const v4 = [];
  const v6 = [];
  for (const cidr of cidrs) {
    const slash = cidr.lastIndexOf("/");
    if (slash === -1) continue;
    const base = ipToBigInt(cidr.slice(0, slash));
    const bits = Number(cidr.slice(slash + 1));
    if (base === null || !Number.isInteger(bits)) continue;
    const isV6 = cidr.includes(":");
    const width = isV6 ? 128 : 32;
    if (bits < 0 || bits > width) continue;
    const size = 1n << BigInt(width - bits);
    (isV6 ? v6 : v4).push([base, base + size - 1n]);
  }
  v4.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  v6.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { v4, v6, size: v4.length + v6.length };
}

/** Is this address inside any range in the index? */
export function inRangeIndex(index, ip) {
  if (!index || !ip) return false;
  const n = ipToBigInt(ip);
  if (n === null) return false;
  const ranges = ip.includes(":") ? index.v6 : index.v4;

  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ranges[mid];
    if (n < start) hi = mid - 1;
    else if (n > end) lo = mid + 1;
    else return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The signals
// ---------------------------------------------------------------------------

/**
 * Paths nothing on this site serves. A request for any of them is a scanner
 * probing for someone else's software.
 *
 * MEASURED, not assumed: across the sampled days, 186 of 193 hostile-path
 * requests returned 404 with content-type text/html, and the rest were 301 or
 * 000. Amplify's `/<*> -> /index.html 404-200` catch-all does NOT rewrite them
 * — extensioned (/wp-admin/install.php) and extensionless (/actuator) probes
 * both 404 alike. So requiring status 200 in isPageView already sheds most
 * scanner noise on its own.
 *
 * This rule still earns its place, and not as a duplicate of the status check:
 * it convicts the VISITOR, not the request. A scanner that probes /.env and
 * also fetches / would otherwise look like an ordinary reader on that second
 * request. One hostile path anywhere in an address's day disqualifies all of
 * it.
 *
 * DO NOT ADD A PATTERN THAT MATCHES A ROUTE THIS SITE SERVES. `/credentials`
 * was in this list on first writing, and /credentials is a real page. Because
 * the rule convicts the visitor rather than the request, that single overlap
 * erased two genuine readers — both of whom had just signed in with Google —
 * along with everything else they did that day. The day reported zero humans
 * and three Google sign-ins, which is self-contradictory, and that is the only
 * reason it was caught. The test "no route this site serves is hostile" reads
 * the app directory and now fails on any repeat.
 */
export const HOSTILE_PATH =
  /wp-admin|wp-login|wp-content|wp-includes|xmlrpc|\/\.env|\/\.git|\/\.aws|\/\.ssh|phpmyadmin|\.php\b|\/vendor\/|\/cgi-bin|autodiscover|\/backup\b|\/shell\b|\/actuator|\/telescope|\/solr|\/boaform|\/hudson|\/eval-stdin/i;

/** Agents that say what they are. Honest crawlers are still not readers. */
export const DECLARED_BOT =
  /bot\b|bot\/|crawl|spider|scrap|Go-http|curl\/|wget|python-requests|libwww|okhttp|java\/|Bytespider|facebookexternalhit|slurp|semrush|ahrefs|mj12|dotbot|censys|expanse|zgrab|masscan|nmap|Lighthouse|Playwright|Puppeteer|Headless|PetalBot|Applebot|GPTBot|ClaudeBot|CCBot|PerplexityBot/i;

/** Above this many HTML pages per minute, it is not a person reading. */
export const MAX_PAGES_PER_MINUTE = 20;

/**
 * Below this many page views, a rate is noise rather than evidence.
 *
 * A reader who opens one page and whose browser fetches its stylesheet a second
 * later has a "rate" of 60 pages/minute if you divide one page by a one-second
 * span. Rate needs INTERVALS BETWEEN PAGES, and n pages give n-1 of them, so a
 * single page view yields no rate at all. This floor is what stopped the
 * classifier from convicting its own regression fixture.
 */
export const MIN_PAGES_FOR_RATE = 5;

/** Above this many pages in a day from one address, it is a crawl. */
export const MAX_PAGES_PER_DAY = 100;

/**
 * The site's own origin. Traffic to any other host header is not ours.
 *
 * CONFIGURED, not hardcoded, and that is load-bearing: as a constant this
 * silently zeroed the entire report. The host filter below drops every row
 * whose x-host-header is not this value, so a stale value does not skew the
 * count — it makes `humans` exactly 0, on a stack whose alarms only fire on
 * ERRORS, so the job stayed green while reporting nothing. That is what
 * happened between the QL-Prod cutover and 2026-08-31: this read
 * quantum.altivum.ai, a hostname the QL-Prod app has never served, and every
 * row was recorded as 0 humans. A domain move must therefore change this
 * WITH the domain — hence the SiteHost template parameter, which reaches the
 * handler as SITE_HOST and is read at the composition root (index.mjs), not
 * here: this module stays pure, so a caller can classify one day against one
 * host and the next against another. The literal below is only the default,
 * and template.test.mjs asserts it equals both the SiteHost parameter default
 * and the hostname of SITE_URL in web/src/lib/site.ts.
 */
export const SITE_HOST = "learner.quantumenv.dev";

export const isHostilePath = (path) => HOSTILE_PATH.test(path ?? "");
export const isDeclaredBot = (ua) => DECLARED_BOT.test(ua ?? "");

/** A rendered page, as opposed to an asset, a redirect or an error. */
export const isPageView = (row) =>
  (row.contentType ?? "").startsWith("text/html") && row.status === "200";

/** Only a real browser engine fetches the build's hashed chunks. */
export const loadedAppAssets = (rows) => rows.some((r) => r.path.includes("/_next/static/"));

// ---------------------------------------------------------------------------
// What a person read — curriculum identifiers, never a request path
// ---------------------------------------------------------------------------

/**
 * A notebook the in-browser lab actually loaded.
 *
 * MEASURED against production traffic, not assumed. JupyterLite's contents
 * manager awaits `fetch(baseUrl + "files/" + path)` on EVERY open, including
 * one whose local copy is already in IndexedDB, and the lab's service worker
 * leaves it alone (its cache is off unless activated with enableCache=true).
 * The object is served `cache-control: public, max-age=0, s-maxage=31536000`,
 * so the browser revalidates every time and CloudFront logs the viewer request
 * whether the edge Hit or Missed. A notebook open is therefore always in this
 * log, with no beacon and no change to the web app.
 *
 * TWO CONSEQUENCES THE PREDICATE ENCODES, both observed in the real log:
 *
 *   - A 304 REVALIDATION CARRIES NO sc-content-type. The column arrives as
 *     "-". Keying on content-type the way isPageView does would silently drop
 *     every repeat open, so status is the only usable success signal here.
 *   - THE SAME NOTEBOOK IS FETCHED TWICE PER OPEN (a 200 then a 304), and
 *     JupyterLab re-fetches whatever was open when the workspace was last used.
 *     A request count would roughly double and would score a restore as a
 *     fresh read, which is why summarizeDay counts DISTINCT (address, notebook)
 *     pairs per day. The honest name for what this measures is "a notebook was
 *     loaded into the lab", restores included.
 *
 * Returns a curriculum key ("01-foundations/01-first-circuit") or null. The key
 * must be in the checked-in allowlist: an unknown path is not counted at all,
 * rather than becoming a new column of a table that promises to hold none.
 */
export const NOTEBOOK_FETCH = /^\/lab\/files\/(\d{2}-[a-z0-9-]+)\/notebooks\/([0-9a-z][0-9a-z-]*)\.ipynb$/;

export function notebookKey(row) {
  if (row.status !== "200" && row.status !== "304") return null;
  const m = NOTEBOOK_FETCH.exec(row.path ?? "");
  if (!m) return null;
  const key = `${m[1]}/${m[2]}`;
  return NOTEBOOKS.has(key) ? key : null;
}

/**
 * A lesson page, as a section slug.
 *
 * DELIBERATELY NOT the RSC prefetch. Next.js fires `/learn/<slug>/__next.*.txt`
 * for every link in the viewport, so on a day with five readers all seven
 * sections carried ten prefetch rows each. Counting those would report that
 * everyone reached everything. The anchored regex excludes them structurally
 * (they carry an extra path segment) and isPageView excludes them again (they
 * are text/plain, not text/html) — two independent guards, because this is the
 * one signal here that would fail toward OVER-counting.
 */
export const LEARN_PAGE = /^\/learn\/(\d{2}-[a-z0-9-]+)\/?$/;

/** The section a single request evidences: a lesson page, or a notebook load. */
export function sectionOf(row) {
  const nb = notebookKey(row);
  if (nb) return nb.slice(0, nb.indexOf("/"));
  if (!isPageView(row)) return null;
  const m = LEARN_PAGE.exec(row.path ?? "");
  if (!m) return null;
  return SECTIONS.has(m[1]) ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Sign-in extraction
// ---------------------------------------------------------------------------

/**
 * Google sign-in lands on our own origin, so it is already in these logs.
 *
 * The hosted-UI authorization-code flow sends the user to Google and Google
 * back to ${origin}/auth/callback. Verified against real traffic on the two
 * days federated accounts were created (2026-07-28 and 2026-08-16): the row is
 * present, status 200, referer https://accounts.google.com/.
 *
 * This matters because it is the ONLY way this account can count Google
 * sign-ins. CloudWatch's FederationSuccesses metric reads 0 despite five
 * federated accounts existing; CloudTrail logs no Cognito sign-in events at
 * all; and Cognito threat protection, the paid option, explicitly "can't be
 * used with federated sign-in".
 *
 * Native (SRP) sign-in happens in-page and never touches this route — it is
 * counted separately by the CloudWatch SignInSuccesses metric. Report the two
 * as separate series; never silently sum them.
 */
export const CALLBACK_PATH = "/auth/callback";
export const GOOGLE_REFERER = /^https:\/\/accounts\.google\.com\//;

export function googleSignIns(rows) {
  return rows.filter(
    (r) => r.path === CALLBACK_PATH && r.status === "200" && GOOGLE_REFERER.test(r.referer),
  );
}

/**
 * The same sign-ins, corroborated by something the requester cannot write.
 *
 * `referer` is a client-supplied header on a route the static export really
 * serves, so a bare GET to /auth/callback carrying `Referer:
 * https://accounts.google.com/` returns 200 with no auth involved. On its own
 * that header outranked every other signal — one forged row and a datacenter
 * crawler reading 60 pages a second was counted as a person, and the same row
 * inflated the only Google sign-in figure this account has.
 *
 * The corroboration is already in the log and is the one thing this file
 * already says a curl-shaped forgery cannot fake: the real hosted-UI redirect
 * lands in a browser, which boots the app from the same address. An address
 * inside a published cloud range is excluded outright — that is the strongest
 * signal here and proof of a person it is not.
 *
 * Takes ONE address's rows, like classifyVisitor.
 */
export function verifiedGoogleSignIns(rows, rangeIndex) {
  if (!loadedAppAssets(rows)) return [];
  if (inRangeIndex(rangeIndex, rows[0]?.ip)) return [];
  return googleSignIns(rows);
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * Classify one address's requests. Returns the first disqualifying reason, or
 * "human" if it survived every signal. Order is cheapest-first, and the reason
 * is retained so the caller can report what each filter removed.
 */
export function classifyVisitor(rows, rangeIndex) {
  if (rows.some((r) => isHostilePath(r.path))) return "scanner";
  if (rows.some((r) => isDeclaredBot(r.ua))) return "declared-bot";

  if (inRangeIndex(rangeIndex, rows[0].ip)) return "datacenter";

  // PROOF OUTRANKS HEURISTIC. Completing a Google sign-in means clearing an
  // interactive consent screen with a real Google account — evidence of a
  // person that no behavioural signal below can match. Without this, a day can
  // report three Google sign-ins and fewer humans than signers, which is not a
  // conservative estimate but a self-contradiction. Deliberately placed AFTER
  // the two conviction rules AND the published-range check, so a prober cannot
  // launder itself by also signing in, and one spoofable header cannot outrank
  // the strongest signal in the file. verifiedGoogleSignIns explains the rest.
  if (verifiedGoogleSignIns(rows, rangeIndex).length > 0) return "human";

  const pages = rows.filter(isPageView);
  if (pages.length === 0) return "no-page-view";
  if (!loadedAppAssets(rows)) return "no-assets";
  if (pages.length > MAX_PAGES_PER_DAY) return "high-volume";

  if (pages.length >= MIN_PAGES_FOR_RATE) {
    // Time the PAGES, not every request. An asset fetched minutes later would
    // otherwise stretch the span and hide a burst of page views inside it.
    const stamps = pages.map((r) => r.ts).sort((a, b) => a - b);
    const spanMinutes = (stamps[stamps.length - 1] - stamps[0]) / 60000;
    // A burst inside a single second has no measurable span; treat it as one
    // second rather than dividing by zero and calling the rate infinite.
    const rate = (pages.length - 1) / Math.max(spanMinutes, 1 / 60);
    if (rate >= MAX_PAGES_PER_MINUTE) return "high-rate";
  }

  return "human";
}

/**
 * Summarize one day of access logs.
 *
 * Every bucket count is returned, not just the human total, because a bare
 * number invites trust it has not earned. `humans` is a floor by construction.
 *
 * `siteHost` is an argument rather than a module constant so the one value
 * whose staleness zeroes the whole report can be varied per call — by a test,
 * and by backfill.mjs replaying a day the site served under its old hostname.
 */
export function summarizeDay(rows, rangeIndex, { day, siteHost = SITE_HOST } = {}) {
  // Host AND, when the caller named one, DAY. Amplify's GenerateAccessLogs was
  // observed returning another in-flight call's window under concurrency: a
  // backfill of 2026-09-01 came back byte-identical to 2026-09-02, every `date`
  // column reading 09-02, and the run printed a plausible row and exited 0. The
  // rows themselves say which day they are, so a wrong-window response now
  // lands as requests: 0 with offSiteRequests > 0 — the shape that already
  // alarms — instead of a mislabelled row on the only copy of the history.
  const mine = rows.filter((r) => r.host === siteHost && (!day || r.date === day));

  const byIp = new Map();
  for (const r of mine) {
    const list = byIp.get(r.ip);
    if (list) list.push(r);
    else byIp.set(r.ip, [r]);
  }

  const buckets = {
    scanner: 0,
    "declared-bot": 0,
    datacenter: 0,
    "no-page-view": 0,
    "no-assets": 0,
    "high-volume": 0,
    "high-rate": 0,
    human: 0,
  };
  const humans = [];
  // What people read, as counts, never as a trail. Each map is keyed by a
  // checked-in curriculum identifier (curriculum.mjs) and valued by a number of
  // DISTINCT ADDRESSES — so a value can never exceed `humans`, one person
  // opening one notebook twice counts once, and the address that made the
  // grouping possible is dropped with `byIp` at the end of this function. The
  // section set is deliberately UNORDERED: "reached 00, 01 and 03 today" is
  // recoverable, "read 03 first" is not, and on a day with a handful of
  // visitors that ordering would describe one person's path through the site.
  // An ordered transition matrix is a separate decision with its own policy
  // sentence, not something to slip in here.
  const notebookOpens = {};
  const sectionReach = {};
  const sectionDepth = {};
  const furthestSection = {};
  const bump = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
  // Counted per address and corroborated, for the same reason the verdict is:
  // an uncorroborated callback row is a header anyone can send, and this is the
  // only Google sign-in figure this account has.
  let google = 0;
  for (const [ip, list] of byIp) {
    const verdict = classifyVisitor(list, rangeIndex);
    buckets[verdict]++;
    if (verdict === "human") {
      humans.push({ ip, pages: list.filter(isPageView).length });

      // Bot exclusion is REUSED, never re-implemented: these counts are taken
      // inside the same loop, gated on the same verdict, so the notebook map
      // and the human total can never disagree about who was a person. The
      // curl/8.7.1 sweep that fetched all 45 notebooks in ten seconds is
      // already a `declared-bot` here and contributes nothing.
      const books = new Set();
      const sections = new Set();
      for (const r of list) {
        const key = notebookKey(r);
        if (key) books.add(key);
        const section = sectionOf(r);
        if (section) sections.add(section);
      }
      for (const key of books) bump(notebookOpens, key);
      for (const section of sections) bump(sectionReach, section);
      if (sections.size > 0) {
        bump(sectionDepth, String(sections.size));
        let furthest = null;
        for (const section of sections) {
          if (furthest === null || sectionIndex(section) > sectionIndex(furthest)) furthest = section;
        }
        bump(furthestSection, furthest);
      }
    }
    google += verifiedGoogleSignIns(list, rangeIndex).length;
  }

  return {
    day: day ?? mine[0]?.date ?? null,
    requests: mine.length,
    offSiteRequests: rows.length - mine.length,
    uniqueIps: byIp.size,
    buckets,
    humans: buckets.human,
    humanPageViews: humans.reduce((n, h) => n + h.pages, 0),
    googleSignIns: google,
    // Sparse by construction: a notebook nobody opened has no key at all, so
    // absent means "not read", and on an older row it means "not collected".
    notebookOpens,
    sectionReach,
    sectionDepth,
    furthestSection,
  };
}
