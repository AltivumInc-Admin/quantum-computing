#!/usr/bin/env node
/**
 * Refuse to run a design-sync against the wrong project.
 *
 * TWO claude.ai projects carry the name "Quantum Learner Design System", and
 * only one of them may ever receive a driver run:
 *
 *   eefe2a41-…  GENERATED. The flat 17-component bundle `.ds-sync/resync.mjs`
 *               produces. Overwriting it is the whole point.
 *   ed6de090-…  COMMISSIONED. Hand-authored tokens, guidelines, ui_kits, brand
 *               components, imagery — the system the product was themed from.
 *               A driver run against this one replaces hand work with
 *               generated output, and the driver deletes what it cannot
 *               regenerate. There is no undo.
 *
 * The names are identical in every listing, so the id is the only thing that
 * distinguishes them — which makes a single mistyped or copy-pasted character
 * destructive. This guard pins the generated target so config drift fails
 * loudly and offline, before any plan is finalized.
 *
 * WHAT A GREEN CHECK HERE DOES NOT PROVE: that the id still points at the
 * project you think it does. A script cannot reach the DesignSync API, so the
 * content assertion is the operator's job and is deliberately not automated
 * away — see the checklist this prints on success.
 *
 * Usage:  node scripts/design-sync/preflight.mjs
 * Exit:   0 = config targets the generated project
 *         1 = config targets something else — STOP
 *         2 = could not check (missing/unparseable config)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The ONLY project a driver run may write to. */
export const SYNC_TARGET = "eefe2a41-9bbd-418c-9b43-ca2f8c5297d7";
/** Hand-authored. Never a driver target. */
export const COMMISSIONED = "ed6de090-a1af-4128-a4b4-752651d074cf";

/** Files that exist ONLY in the commissioned project — a positive tell. */
export const COMMISSIONED_MARKERS = ["SKILL.md", "tokens/colors.css", "guidelines/", "ui_kits/"];
/** The generated project's anchor — absent from the commissioned one. */
export const GENERATED_MARKER = "_ds_sync.json";

function main() {
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(join(ROOT, ".design-sync/config.json"), "utf8"));
  } catch (err) {
    console.error(`\n  design-sync preflight: cannot read .design-sync/config.json\n  ${err.message}\n`);
    process.exit(2);
  }

  if (cfg.projectId !== SYNC_TARGET) {
    console.error(`
  design-sync preflight: config.json targets a project this repo does not sync.

    configured : ${cfg.projectId}
    expected   : ${SYNC_TARGET}  (generated bundle)

  If that is the COMMISSIONED project (${COMMISSIONED}), STOP —
  a driver run there overwrites hand-authored tokens, guidelines and ui_kits
  with generated output, and deletes what it cannot regenerate.

  Retarget deliberately only by editing SYNC_TARGET here, in the same commit
  as the config change, so the pairing stays reviewable.
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

main();
