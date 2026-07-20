#!/usr/bin/env node
/**
 * Stage the self-hosted Monaco editor core.
 *
 * @monaco-editor/loader defaults to fetching the editor from cdn.jsdelivr.net
 * at runtime — the last third-party runtime origin in a site that otherwise
 * self-hosts everything (the Pyodide runtime, the JupyterLite lab). This copies
 * the AMD build (monaco-editor/min/vs) into web/public/monaco/<version>/vs so the
 * static export serves it same-origin; code-editor.tsx points loader.config() at
 * MONACO_VS_PATH (web/src/lib/monaco-path.ts).
 *
 * VERSION-STAMPED PATH: `/monaco/**` is served `immutable` for a year, which is
 * only honest if every URL changes when the bytes change. Monaco's entry files
 * (loader.js, editor/editor.main.js, basic-languages/monaco.contribution.js) are
 * UNHASHED names that hard-reference content-hashed siblings, so a bump would
 * otherwise leave a cached entry file pointing at chunk URLs the new deploy no
 * longer serves. The version directory makes the whole tree cache-safe. This
 * script is the enforcement point: it stages into the INSTALLED version's
 * directory and fails the build if monaco-path.ts disagrees.
 *
 * FILTERED COPY: the upstream min/vs tree is ~15 MB, and Next copies public/
 * wholesale into out/, so every byte lands in the deploy artifact. The single
 * call site pins language="python" (runnable-editor.tsx) and no `vs/nls`
 * locale is ever configured, which makes ~10 MB of it permanently unreachable:
 * the ts/css/html/json language-service workers (Monaco only spawns those for
 * ts/js/css/html/json models — the URLs are computed strings in
 * editor.main.js, never eager imports) and the localized nls.messages bundles
 * (vs/nls.messages-loader.js short-circuits to `n({})` unless
 * `vs/nls`.availableLanguages["*"] is set to a non-"en" locale, which nothing
 * here does). editor.worker IS kept — the core uses it for every model.
 *
 * If a future caller ever needs a non-Python language, drop the matching worker
 * from DROP_WORKERS (and see e2e/runnable-editor.e2e.ts, which boots the staged
 * tree in a real browser and asserts no request 404s).
 *
 * web/public/monaco/ is gitignored (like public/pyodide/) and re-staged by the
 * web `prebuild`/`predev` hooks. Paths resolve from this script's location, so
 * cwd does not matter. Fails loudly if the copy is incomplete or has re-inflated
 * so a broken deploy cannot silently ship a permanently-loading editor.
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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

const { version } = JSON.parse(readFileSync(pkgJsonPath, "utf8"));

// The runtime loader path is a COMMITTED constant, not a generated file, so the
// Jest suite and `tsc` resolve it without running this staging step. Keeping the
// two in sync is therefore this script's job: disagree and the build stops.
const MONACO_PATH_TS = path.join(WEB, "src", "lib", "monaco-path.ts");
const declared = readFileSync(MONACO_PATH_TS, "utf8").match(
  /export const MONACO_VERSION = "([^"]+)";/
)?.[1];
if (declared !== version) {
  console.error(
    `stage-monaco: version mismatch — monaco-editor is ${version} but ` +
      `web/src/lib/monaco-path.ts declares ${declared ?? "(unparseable)"}.\n` +
      `  Update MONACO_VERSION to "${version}" so the loader points at the staged tree.`
  );
  process.exit(1);
}

const src = path.join(path.dirname(pkgJsonPath), "min", "vs");
const destRoot = path.join(WEB, "public", "monaco");
const dest = path.join(destRoot, version, "vs");

// Language-service workers for languages this app never creates a model for.
const DROP_WORKERS = ["ts.worker", "css.worker", "html.worker", "json.worker"];
// Localized UI strings; only fetched when a `vs/nls` locale is configured.
const isLocaleBundle = (name) => /^nls\.messages\..+\.js$/.test(name);
const isDroppedWorker = (name) => DROP_WORKERS.some((w) => name.startsWith(`${w}-`));

rmSync(destRoot, { recursive: true, force: true });
cpSync(src, dest, {
  recursive: true,
  filter: (from) => {
    const name = path.basename(from);
    return !isDroppedWorker(name) && !isLocaleBundle(name);
  },
});

// Build-time assertions. The three UNHASHED entry points are what actually pull
// the hashed chunk graph at runtime; loader.js alone (the previous sole check)
// carries no static reference to it, so a truncated copy used to pass.
const REQUIRED = [
  "loader.js",
  "editor/editor.main.js",
  "editor/editor.main.css",
  "basic-languages/monaco.contribution.js",
  "nls.messages-loader.js",
];
for (const rel of REQUIRED) {
  if (!existsSync(path.join(dest, rel))) {
    console.error(
      `stage-monaco: staging failed — web/public/monaco/${version}/vs/${rel} is missing.`
    );
    process.exit(1);
  }
}

// The python tokenizer is the one language chunk this app must be able to reach.
const basicLanguages = path.join(dest, "basic-languages");
const contribution = readFileSync(
  path.join(basicLanguages, "monaco.contribution.js"),
  "utf8"
);
const pythonChunk = contribution.match(/\.\.\/(python-[A-Za-z0-9_-]+)/)?.[1];
if (!pythonChunk || !existsSync(path.join(dest, `${pythonChunk}.js`))) {
  console.error(
    "stage-monaco: staging failed — the python language chunk referenced by " +
      "basic-languages/monaco.contribution.js is not in the staged tree."
  );
  process.exit(1);
}

// Size ceiling: a monaco upgrade that reshuffles min/vs (renaming the workers,
// say, so the filter stops matching) must fail the build rather than silently
// re-inflate the deploy artifact by ~10 MB.
const MAX_STAGED_BYTES = 8 * 1024 * 1024;
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}
let staged = 0;
for (const file of walk(dest)) staged += statSync(file).size;
if (staged > MAX_STAGED_BYTES) {
  console.error(
    `stage-monaco: staged tree is ${(staged / 1024 / 1024).toFixed(1)} MB, over the ` +
      `${(MAX_STAGED_BYTES / 1024 / 1024).toFixed(0)} MB ceiling — the unreachable-asset ` +
      `filter (workers/locales) probably stopped matching after a monaco upgrade.`
  );
  process.exit(1);
}

console.log(
  `Staged monaco-editor@${version} -> web/public/monaco/${version}/vs ` +
    `(${(staged / 1024 / 1024).toFixed(1)} MB)`
);
