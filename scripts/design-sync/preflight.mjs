#!/usr/bin/env node
/**
 * Refuse to run a design-sync against the wrong project.
 *
 * The pin itself, and the pure verdict over a parsed config, live in
 * targets.mjs — which is where preflight.test.mjs exercises them, and where a
 * retarget must be edited. This file is the runner: it reads the config, maps a
 * verdict onto an exit code, and prints the manual checklist a green run does
 * NOT discharge.
 *
 * WHAT A GREEN CHECK HERE DOES NOT PROVE: that the id still points at the
 * project you think it does. A script cannot reach the DesignSync API, so the
 * content assertion is the operator's job and is deliberately not automated
 * away — see the checklist this prints on success.
 *
 * Usage:  make design-sync   (or: node scripts/design-sync/preflight.mjs)
 * Exit:   0 = config targets the generated project
 *         1 = config targets something else — STOP
 *         2 = could not check (missing/unparseable config)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import {
  verdict,
  SYNC_TARGET,
  COMMISSIONED,
  COMMISSIONED_MARKERS,
  GENERATED_MARKER,
} from "./targets.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function main() {
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(join(ROOT, ".design-sync/config.json"), "utf8"));
  } catch (err) {
    console.error(`\n  design-sync preflight: cannot read .design-sync/config.json\n  ${err.message}\n`);
    process.exit(2);
  }

  const v = verdict(cfg);
  if (!v.ok) {
    const configured = v.configured ?? "(no projectId in config.json)";
    // The commissioned id is the destructive case, so it is named outright
    // rather than offered as a possibility the operator has to check.
    const warning =
      v.reason === "commissioned"
        ? `  That is the COMMISSIONED project. STOP —`
        : `  If that is the COMMISSIONED project (${COMMISSIONED}), STOP —`;
    console.error(`
  design-sync preflight: config.json targets a project this repo does not sync.

    configured : ${configured}
    expected   : ${SYNC_TARGET}  (generated bundle)

${warning}
  a driver run there overwrites hand-authored tokens, guidelines and ui_kits
  with generated output, and deletes what it cannot regenerate.

  Retarget deliberately only by editing SYNC_TARGET in targets.mjs, in the same
  commit as the config change, so the pairing stays reviewable — and so
  preflight.test.mjs, which asserts the two agree, fails on a one-sided edit.
`);
    process.exit(1);
  }

  console.log(`
  design-sync preflight: config targets the generated bundle. OK.

  Still yours to verify, before finalize_plan — the id alone cannot prove it:

    1. DesignSync(list_files) on ${SYNC_TARGET}
    2. It MUST contain ${GENERATED_MARKER}
    3. It MUST NOT contain any of: ${COMMISSIONED_MARKERS.join(", ")}

  A hit on step 3 means the ids have been swapped upstream. Stop and re-read
  .design-sync/NOTES.md rather than "fixing" the config to match.
`);
}

// Runner only when run as a script: importing this file must not run the guard
// (main() exits the process, which would kill an importing test worker).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
