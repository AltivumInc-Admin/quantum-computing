import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  verdict,
  SYNC_TARGET,
  COMMISSIONED,
  COMMISSIONED_MARKERS,
  GENERATED_MARKER,
} from "./targets.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = JSON.parse(readFileSync(join(REPO, ".design-sync/config.json"), "utf8"));

test("the committed config targets the pinned generated project", () => {
  // The pairing this whole feature protects. Until this test existed it was
  // checked only when an operator remembered to type the command — while the
  // sync skill is itself instructed to write projectId back into config.json
  // whenever it is "absent or different", so an aborted run could retarget the
  // file. Now a one-sided edit fails the merge.
  assert.equal(cfg.projectId, SYNC_TARGET);
});

test("the two ids are distinct, and the commissioned one is never the target", () => {
  // Both are uuids differing from the first character; a paste that collapsed
  // them would make every other assertion here vacuous.
  assert.notEqual(SYNC_TARGET, COMMISSIONED);
  assert.notEqual(cfg.projectId, COMMISSIONED);
});

test("a config carrying the commissioned id is refused, by name", () => {
  const v = verdict({ projectId: COMMISSIONED });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "commissioned");
  assert.equal(v.configured, COMMISSIONED);
});

test("a config carrying any other id is refused", () => {
  const v = verdict({ projectId: "00000000-0000-4000-8000-000000000000" });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "unknown");
});

test("a config that lost its projectId is refused, not compared against undefined", () => {
  // Without the explicit shape check, a projectId that became a number or an
  // object would still refuse, but the message would print "[object Object]"
  // as the configured id. Name the shape instead.
  for (const bad of [{}, { projectId: null }, { projectId: 42 }, null, undefined]) {
    const v = verdict(bad);
    assert.equal(v.ok, false, `expected refusal for ${JSON.stringify(bad ?? null)}`);
    assert.equal(v.reason, "missing");
    assert.equal(v.configured, null);
  }
});

test("the committed config is accepted", () => {
  const v = verdict(cfg);
  assert.equal(v.ok, true);
  assert.equal(v.reason, "generated");
});

test("the manual checklist's two marker sets cannot both match one project", () => {
  // Steps 2 and 3 of the checklist preflight prints only discriminate while the
  // generated anchor is absent from the commissioned tells.
  assert.ok(COMMISSIONED_MARKERS.length > 0);
  assert.ok(!COMMISSIONED_MARKERS.includes(GENERATED_MARKER));
});

test("importing the runner does not run the guard", async () => {
  // preflight.mjs calls process.exit on every refusal path, so a top-level
  // main() would kill this worker rather than fail a test. The import-meta
  // guard is what keeps the module importable at all.
  const mod = await import("./preflight.mjs");
  assert.equal(typeof mod, "object");
});
