#!/usr/bin/env node
/**
 * Stage the self-hosted Monaco editor core.
 *
 * @monaco-editor/loader defaults to fetching the editor from cdn.jsdelivr.net
 * at runtime — the last third-party runtime origin in a site that otherwise
 * self-hosts everything (the Pyodide runtime, the JupyterLite lab). This copies
 * the AMD build (monaco-editor/min/vs) into web/public/monaco/vs so the static
 * export serves it same-origin; code-editor.tsx points loader.config() at
 * /monaco/vs.
 *
 * web/public/monaco/ is gitignored (like public/pyodide/) and re-staged by the
 * web `prebuild`/`predev` hooks. Paths resolve from this script's location, so
 * cwd does not matter. Fails loudly if the copy is incomplete (no loader.js)
 * so a broken deploy cannot silently ship a permanently-loading editor.
 */
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");

const requireFromWeb = createRequire(path.join(WEB, "package.json"));
let pkgJsonPath;
try {
  pkgJsonPath = requireFromWeb.resolve("monaco-editor/package.json");
} catch {
  console.error("stage-monaco: monaco-editor is not installed — run `npm ci` in web/ first.");
  process.exit(1);
}

const src = path.join(path.dirname(pkgJsonPath), "min", "vs");
const destRoot = path.join(WEB, "public", "monaco");
const dest = path.join(destRoot, "vs");

rmSync(destRoot, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });

// Build-time assertion: the AMD bootstrap must exist at the exact path the
// runtime loader.config() points at, or the editor can never boot.
if (!existsSync(path.join(dest, "loader.js"))) {
  console.error("stage-monaco: staging failed — web/public/monaco/vs/loader.js is missing.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
console.log(`Staged monaco-editor@${version} -> web/public/monaco/vs`);
