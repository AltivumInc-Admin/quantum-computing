import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { barrelFor, packageJsonFor, StagingError } from "./staging.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = JSON.parse(readFileSync(join(REPO, ".design-sync/config.json"), "utf8"));

/** Every `export { … }` name the generated barrel emits, in emission order. */
function exportedNames(source) {
  return [...source.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) =>
    m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

test("the barrel exports exactly componentSrcMap, no more and no fewer", () => {
  // The drift this generation exists to end: the hand-maintained barrel's
  // header said 18 components while it exported 17, and the config pinned 17.
  const { source, count } = barrelFor(cfg);
  const names = exportedNames(source);
  assert.deepEqual(names, Object.keys(cfg.componentSrcMap));
  assert.equal(count, names.length);
});

test("the barrel's header states the count it actually exports", () => {
  // The one place the old copy went wrong. Reading it back out of the prose
  // keeps the header honest even if the wording changes around it.
  const { source, count } = barrelFor(cfg);
  const stated = source.match(/layer \((\d+) components\)/);
  assert.ok(stated, "the header must state a component count");
  assert.equal(Number(stated[1]), count);
});

test("components sharing a source module collapse into one export block", () => {
  // Ten of the seventeen come from quantum/widget-ui.tsx; emitting ten separate
  // statements would bundle the same module ten times over in the diff.
  const { source, moduleCount } = barrelFor(cfg);
  const uniquePaths = new Set(Object.values(cfg.componentSrcMap));
  assert.equal(moduleCount, uniquePaths.size);
  assert.equal(source.match(/\bfrom "/g).length, moduleCount);
});

test("source paths become @/ specifiers relative to cfg.srcDir", () => {
  const { source } = barrelFor({
    srcDir: "../../web/src",
    componentSrcMap: { Widget: "../../web/src/components/quantum/widget-ui.tsx" },
  });
  assert.match(source, /export \{ Widget \} from "@\/components\/quantum\/widget-ui";/);
});

test("a component outside cfg.srcDir is refused, not aliased into nonsense", () => {
  // `@/` maps to srcDir alone, so a path above it cannot be expressed — better
  // an exit 1 naming the entry than a specifier esbuild fails on much later.
  assert.throws(
    () => barrelFor({ srcDir: "../../web/src", componentSrcMap: { Stray: "../../lambda/tutor/index.mjs" } }),
    StagingError
  );
});

test("an empty or absent componentSrcMap is refused", () => {
  for (const bad of [{}, { componentSrcMap: {} }, { componentSrcMap: null }]) {
    assert.throws(() => barrelFor(bad), StagingError);
  }
});

test("pkg/package.json carries the config's package name", () => {
  // Its `name` is what makes package-build resolve PKG_DIR to pkg/ instead of
  // .ds-sync/ (whose package.json is the converter-deps stub).
  assert.equal(JSON.parse(packageJsonFor(cfg)).name, cfg.pkg);
  assert.equal(JSON.parse(packageJsonFor(cfg)).private, true);
});

test("a config with no pkg name is refused", () => {
  for (const bad of [{}, { pkg: "" }, { pkg: 7 }, null]) {
    assert.throws(() => packageJsonFor(bad), StagingError);
  }
});
