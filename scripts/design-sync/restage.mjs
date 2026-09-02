#!/usr/bin/env node
/**
 * Rebuild the parts of `.ds-sync/` that a fresh clone cannot inherit.
 *
 * `.ds-sync/` is gitignored machine state: the vendored skill scripts, a
 * node_modules symlink, a generated tsconfig, the barrel and its package stub.
 * Gitignoring it is the right call — the skill's scripts must come from the
 * installed skill, not a stale copy in this repo. But four pieces of it are
 * REPO-SHAPED, not skill-shaped: each is derivable from a file that IS
 * committed, so each belongs to this script rather than to an operator's
 * memory. Two of them silently broke the 2026-08-24 re-sync after being
 * hand-fixed once and lost:
 *
 *   1. `pkg/node_modules` was symlinked to an absolute path from a previous
 *      machine layout (…/altivum-dev/quantum/…). The driver dies with
 *      "--node-modules … does not exist" — which reads like a missing install.
 *      Computing the link target from THIS checkout makes the break impossible.
 *
 *   2. `tsconfig.json`'s `paths` need every bare-directory import listed
 *      BEFORE the `@/*` wildcard. The bundler's resolver probes extensions
 *      starting with the empty string using existsSync — true for a directory
 *      — and matches rules in KEY ORDER, not by specificity. So `@/i18n`
 *      resolves to the DIRECTORY and esbuild fails with
 *      `Cannot read file "web/src/i18n": is a directory`. Generating the list
 *      from the filesystem also means a directory added later is covered
 *      without anyone rediscovering the rule.
 *
 *   3. `pkg/package.json` is a hand copy of `cfg.pkg`, and its `name` is what
 *      pins PKG_DIR to `pkg/` rather than to `.ds-sync/`. A mis-staged copy
 *      breaks every cfg-relative path at once.
 *
 *   4. `pkg/entry.jsx` is a barrel re-exporting exactly `cfg.componentSrcMap`.
 *      Hand-maintained, it drifted from the config it mirrors — its header
 *      claimed 18 components while it exported 17. Generating it from the map
 *      makes that class of drift structurally impossible.
 *
 * The derivations for 3 and 4 are pure and live in staging.mjs, where
 * restage.test.mjs exercises them without a staged `.ds-sync/`.
 *
 * Idempotent: run it after any fresh clone, any time web/src grows a new
 * index-bearing directory, and any time componentSrcMap changes. It does NOT
 * vendor the skill's scripts — that copy is the skill's job (the `cp -r` line
 * in `.ds-sync/storybook/SKILL.md` §2.4).
 *
 * Usage:  make design-sync   (or: node scripts/design-sync/restage.mjs)
 * Exit:   0 = staged (or already correct)
 *         1 = the repo is missing something this cannot create
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { barrelFor, packageJsonFor, StagingError } from "./staging.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CFG = join(ROOT, ".design-sync/config.json");
const WEB_SRC = join(ROOT, "web/src");
const WEB_NM = join(ROOT, "web/node_modules");
const PKG = join(ROOT, ".ds-sync/pkg");
const TSCONFIG = join(ROOT, ".ds-sync/tsconfig.json");

const say = (ok, msg) => console.log(`  ${ok ? "ok  " : "->  "}${msg}`);
const die = (msg) => {
  console.error(`\n  restage: ${msg}\n`);
  process.exit(1);
};

/** Write only on change, so a re-run reports "ok" instead of churning mtimes. */
function put(path, body) {
  const same = existsSync(path) && readFileSync(path, "utf8") === body;
  if (!same) writeFileSync(path, body);
  return !same;
}

if (!existsSync(WEB_NM)) die(`${relative(ROOT, WEB_NM)} is missing — run \`npm ci\` in web/ first.`);

let cfg;
try {
  cfg = JSON.parse(readFileSync(CFG, "utf8"));
} catch (err) {
  die(`cannot read ${relative(ROOT, CFG)}\n  ${err.message}`);
}

// `.ds-sync/pkg/` is this script's to create: everything it must contain is
// derived from the committed config, so a missing directory is not an operator
// error. Only pkg/assets/ is genuinely build-derived (the compiled CSS chunks
// and woff2 from `web/out`), and that is reported at the end, not created.
mkdirSync(PKG, { recursive: true });

// ── 1. node_modules symlink, always pointed at THIS checkout ──────────────
const link = join(PKG, "node_modules");
let relinked = false;
try {
  const cur = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : null;
  if (cur !== WEB_NM) {
    rmSync(link, { recursive: true, force: true });
    relinked = true;
  }
} catch {
  relinked = true;
}
if (relinked) symlinkSync(WEB_NM, link);
say(!relinked, `pkg/node_modules -> ${relative(ROOT, WEB_NM)}${relinked ? "  (repointed)" : ""}`);

// ── 2 & 3. pkg/package.json and the barrel, both from config.json ─────────
let barrel;
let pkgJson;
try {
  pkgJson = packageJsonFor(cfg);
  barrel = barrelFor(cfg);
} catch (err) {
  if (!(err instanceof StagingError)) throw err;
  die(`${err.message}\n  (in ${relative(ROOT, CFG)})`);
}

const wrotePkgJson = put(join(PKG, "package.json"), pkgJson);
say(!wrotePkgJson, `pkg/package.json  name="${cfg.pkg}"${wrotePkgJson ? "  (rewritten)" : ""}`);

const wroteBarrel = put(join(PKG, "entry.jsx"), barrel.source);
say(
  !wroteBarrel,
  `pkg/entry.jsx  ${barrel.count} component(s) from ${barrel.moduleCount} module(s)` +
    `${wroteBarrel ? "  (regenerated)" : ""}`
);

// ── 4. tsconfig paths: exact index rules BEFORE the wildcard ──────────────
const SKIP = new Set(["__tests__", "__fixtures__", "__mocks__", "node_modules"]);
const exact = {};
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const index = ["index.ts", "index.tsx"].map((f) => join(full, f)).find(existsSync);
    if (index) exact[`@/${relative(WEB_SRC, full)}`] = [index];
    walk(full);
  }
})(WEB_SRC);

const shim = (name) => join(ROOT, ".ds-sync/shims", name);
const paths = {
  // Exact rules first — the resolver matches in key order (see the header).
  ...exact,
  "@/*": [join(WEB_SRC, "*")],
  "next/link": [shim("next-link.tsx")],
  "next/navigation": [shim("next-navigation.tsx")],
  "next-themes": [shim("next-themes.tsx")],
};

mkdirSync(dirname(TSCONFIG), { recursive: true });
writeFileSync(
  TSCONFIG,
  JSON.stringify({ compilerOptions: { baseUrl: ".", jsx: "react-jsx", paths } }, null, 2) + "\n"
);
say(false, `tsconfig.json paths rewritten — ${Object.keys(exact).length} exact rule(s) ahead of "@/*"`);
for (const k of Object.keys(exact)) console.log(`        ${k}`);

if (!existsSync(join(PKG, "assets"))) {
  say(false, `pkg/assets/ absent — restage ds-styles.css + media per .design-sync/NOTES.md`);
}

console.log(`
  Staged. Still the skill's job (not this script's): the \`cp -r\` of the driver
  scripts, the converter deps, and chromium — .ds-sync/storybook/SKILL.md §2.4.
`);
