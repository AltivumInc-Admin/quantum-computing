#!/usr/bin/env node
/**
 * Rebuild the parts of `.ds-sync/` that a fresh clone cannot inherit.
 *
 * `.ds-sync/` is gitignored machine state: the vendored skill scripts, a
 * node_modules symlink, and a generated tsconfig. That is the right call —
 * the skill's scripts must come from the installed skill, not a stale copy in
 * this repo. But two pieces of it are REPO-SHAPED, not skill-shaped, and both
 * silently broke a re-sync on 2026-08-24 after being hand-fixed once and lost:
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
 * Idempotent: run it after any fresh clone, and any time web/src grows a new
 * index-bearing directory. It does NOT vendor the skill's scripts — that copy
 * is the skill's job (see .design-sync/NOTES.md §7.1).
 *
 * Usage:  node scripts/design-sync/restage.mjs
 * Exit:   0 = staged (or already correct)
 *         1 = the repo is missing something this cannot create
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB_SRC = join(ROOT, "web/src");
const WEB_NM = join(ROOT, "web/node_modules");
const PKG = join(ROOT, ".ds-sync/pkg");
const TSCONFIG = join(ROOT, ".ds-sync/tsconfig.json");

const say = (ok, msg) => console.log(`  ${ok ? "ok  " : "->  "}${msg}`);

if (!existsSync(WEB_NM)) {
  console.error(`\n  restage: ${relative(ROOT, WEB_NM)} is missing — run \`npm ci\` in web/ first.\n`);
  process.exit(1);
}
if (!existsSync(PKG)) {
  console.error(`\n  restage: ${relative(ROOT, PKG)} is missing — re-stage the skill's scripts first (NOTES.md §7.1).\n`);
  process.exit(1);
}

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

// ── 2. tsconfig paths: exact index rules BEFORE the wildcard ──────────────
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

console.log(`
  Staged. Still the skill's job (not this script's): the \`cp -r\` of the
  driver scripts, the converter deps, and chromium — NOTES.md §7.1.
`);
