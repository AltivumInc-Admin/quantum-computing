import { readFileSync } from "fs";
import { join } from "path";

/**
 * Contract guard for the repo-root customHttp.yml — the ONLY response-header
 * surface for this static export (Amplify Hosting applies it; there is no
 * server). Like contrast-guard.test.ts, this is a structural scan (no YAML
 * dependency): the file's shape is a flat list of pattern blocks, each with
 * key/value header pairs, so a small regex parser is faithful and keeps the
 * contract loud when someone reorders, renames, or deletes a block.
 *
 * The contract:
 *  1. every content-hashed / version-stamped tree is cached immutably — and
 *     ONLY those: `immutable` suppresses revalidation for a year, so granting
 *     it to a tree with stable, unhashed entry filenames (the lesson Pyodide
 *     runtime, /welcome imagery) would strand returning learners on a stale
 *     entry file after a version bump,
 *  2. the '/**' security block exists with the baseline headers and carries
 *     NO Cache-Control (header keys stay disjoint across overlapping
 *     patterns — Amplify defines no same-key precedence),
 *  3. the two original /lab rules are preserved.
 */

const YML_PATH = join(__dirname, "..", "..", "..", "customHttp.yml");

const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

type Block = { pattern: string; headers: Record<string, string> };

/** Parse the simple two-level shape this file uses: pattern blocks, each
 * holding a list of quoted key/value header pairs. */
function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of src.split("\n")) {
    if (/^\s*#/.test(line)) continue; // comments
    const pattern = line.match(/^\s*-\s*pattern:\s*'([^']+)'\s*$/);
    if (pattern) {
      current = { pattern: pattern[1], headers: {} };
      blocks.push(current);
      continue;
    }
    const key = line.match(/^\s*-\s*key:\s*'([^']+)'\s*$/);
    if (key && current) {
      current.headers[key[1]] = "__pending__";
      continue;
    }
    const value = line.match(/^\s*value:\s*(?:'([^']+)'|"([^"]+)")\s*$/);
    if (value && current) {
      const pendingKey = Object.keys(current.headers).find(
        (k) => current!.headers[k] === "__pending__",
      );
      if (pendingKey) current.headers[pendingKey] = value[1] ?? value[2];
    }
  }
  return blocks;
}

const src = readFileSync(YML_PATH, "utf8");
const blocks = parseBlocks(src);
const byPattern = new Map(blocks.map((b) => [b.pattern, b]));

describe("customHttp.yml header contract", () => {
  it("parses into pattern blocks (sanity: the structural scan is not vacuous)", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(7);
    for (const b of blocks) {
      expect(Object.keys(b.headers).length).toBeGreaterThan(0);
      for (const v of Object.values(b.headers)) {
        expect(v).not.toBe("__pending__"); // every key found its value
      }
    }
  });

  it.each([
    "/lab/build/**",
    "/lab/files/wheels/**",
    "/_next/static/**",
    "/monaco/**",
  ])("caches the hashed/version-pinned tree %s immutably", (pattern) => {
    const block = byPattern.get(pattern);
    expect(block).toBeDefined();
    expect(block!.headers["Cache-Control"]).toBe(IMMUTABLE);
  });

  it("preserves both original /lab cache rules verbatim", () => {
    // Regression guard: the original lab rules must never be dropped in a rewrite.
    expect(byPattern.get("/lab/build/**")?.headers["Cache-Control"]).toBe(IMMUTABLE);
    expect(byPattern.get("/lab/files/wheels/**")?.headers["Cache-Control"]).toBe(IMMUTABLE);
  });

  it.each(["/welcome/**", "/pyodide/**", "/lab/static/pyodide/**"])(
    "gives the unhashed tree %s a bounded (non-immutable) cache",
    (pattern) => {
      // `immutable` tells the browser to skip revalidation for the whole
      // max-age, so it is only honest for a tree whose URLs change when its
      // bytes do. /welcome/ keeps its filenames across deploys, and BOTH
      // self-hosted Pyodide trees — the lesson runtime at /pyodide/ and the lab
      // kernel's separately-pinned copy at /lab/static/pyodide/ — ship the same
      // stable unhashed names (pyodide.js, pyodide.asm.js, pyodide.asm.wasm,
      // python_stdlib.zip) that a version bump reuses. A partially-evicted cache
      // would then serve a JS/wasm mismatch: the lesson runtime silently fails
      // over to the CDN, and the lab kernel — which has no fallback — never boots.
      const cc = byPattern.get(pattern)?.headers["Cache-Control"];
      expect(cc).toBe("public, max-age=86400");
      expect(cc).not.toContain("immutable");
    },
  );

  it("caches the lab kernel's Pyodide tree at all (it fell through to Amplify defaults)", () => {
    // The gap this block closed: /lab/build/** and /lab/files/wheels/** were
    // covered, but the 31 MB distribution the kernel actually boots from lives
    // at /lab/static/pyodide/ and matched no pattern, so every "Run in browser"
    // re-fetched it. Asserting the block EXISTS is the regression guard; the
    // bounded-value case above pins what it says.
    expect(byPattern.get("/lab/static/pyodide/**")).toBeDefined();
  });

  it("grants immutable only to trees whose URLs change when their bytes do", () => {
    // The appropriateness check the per-pattern cases above cannot make on their
    // own: any NEW immutable pattern must name a content-hashed tree
    // (/_next/static, /lab/build, /lab/files/wheels) or a version-stamped one
    // (/monaco/<version>/…). A future unhashed tree added to the immutable list
    // fails here instead of failing in a returning learner's browser a release
    // later — which is exactly how the two Pyodide trees came to be bounded.
    const KNOWN_HASHED = new Set([
      "/lab/build/**",
      "/lab/files/wheels/**",
      "/_next/static/**",
    ]);
    const VERSION_STAMPED = new Set(["/monaco/**"]);
    const unjustified = blocks
      .filter((b) => b.headers["Cache-Control"] === IMMUTABLE)
      .map((b) => b.pattern)
      .filter((p) => !KNOWN_HASHED.has(p) && !VERSION_STAMPED.has(p));
    // Any pattern listed here is cached immutably without hashed or
    // version-stamped URLs — see the comments in customHttp.yml.
    expect(unjustified).toEqual([]);
  });

  it("keeps the Monaco loader path version-stamped (the premise of its immutable grant)", () => {
    // /monaco/** is only safe to cache immutably because scripts/stage-monaco.mjs
    // stages into /monaco/<version>/vs and the loader points there; if that
    // constant ever loses its version segment the grant becomes a trap.
    const monacoPath = readFileSync(
      join(__dirname, "..", "..", "src", "lib", "monaco-path.ts"),
      "utf8",
    );
    const version = monacoPath.match(/export const MONACO_VERSION = "([^"]+)";/)?.[1];
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(monacoPath).toContain("`/monaco/${MONACO_VERSION}/vs`");
  });

  it("carries the '/**' security block with the baseline headers", () => {
    const sec = byPattern.get("/**");
    expect(sec).toBeDefined();
    const h = sec!.headers;
    expect(h["Strict-Transport-Security"]).toMatch(/^max-age=\d+; includeSubDomains$/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Content-Security-Policy"]).toContain("base-uri 'self'");
    // X-Frame-Options must agree with the frame-ancestors choice.
    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
  });

  it("keeps header keys disjoint: no Cache-Control inside '/**', no security keys in cache blocks", () => {
    // Amplify's docs define no precedence when the same key appears in two
    // blocks matching one path — disjoint keys keep composition unambiguous.
    const sec = byPattern.get("/**")!;
    expect(sec.headers["Cache-Control"]).toBeUndefined();
    for (const b of blocks) {
      if (b.pattern === "/**") continue;
      expect(Object.keys(b.headers)).toEqual(["Cache-Control"]);
    }
  });

  it("stages no full CSP yet (script-src/style-src would break Pyodide + Next inline scripts)", () => {
    const csp = byPattern.get("/**")!.headers["Content-Security-Policy"];
    expect(csp).not.toContain("script-src");
    expect(csp).not.toContain("style-src");
    expect(csp).not.toContain("default-src");
  });
});
