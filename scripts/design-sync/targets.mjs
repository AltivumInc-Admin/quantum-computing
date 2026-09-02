/**
 * Which claude.ai project a design-sync driver run may write to — and which it
 * must never touch.
 *
 * TWO projects carry the name "Quantum Learner Design System":
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
 * destructive.
 *
 * Pure and dependency-free, in the shape scripts/changelog/rules.mjs uses: no
 * top-level I/O and no process.exit, so preflight.test.mjs can exercise every
 * verdict — including the refusals, which are the ones worth asserting — with
 * no config file and no node_modules. The I/O and the exit codes live in
 * preflight.mjs, the runner.
 */

/** The ONLY project a driver run may write to. */
export const SYNC_TARGET = "eefe2a41-9bbd-418c-9b43-ca2f8c5297d7";
/** Hand-authored. Never a driver target. */
export const COMMISSIONED = "ed6de090-a1af-4128-a4b4-752651d074cf";

/** Files that exist ONLY in the commissioned project — a positive tell. */
export const COMMISSIONED_MARKERS = ["SKILL.md", "tokens/colors.css", "guidelines/", "ui_kits/"];
/** The generated project's anchor — absent from the commissioned one. */
export const GENERATED_MARKER = "_ds_sync.json";

/**
 * Judge a parsed .design-sync/config.json against the pin.
 *
 * Returns `{ ok, reason, configured }`. The reasons are distinct because the
 * remedies are: "commissioned" is the destructive case and gets named outright
 * rather than hedged, "unknown" is a plain retarget, and "missing" is a config
 * that lost its projectId entirely — which must refuse rather than fall through
 * to a comparison against `undefined`.
 */
export function verdict(cfg) {
  const configured = cfg && typeof cfg.projectId === "string" ? cfg.projectId : null;
  if (configured === null) return { ok: false, reason: "missing", configured };
  if (configured === SYNC_TARGET) return { ok: true, reason: "generated", configured };
  if (configured === COMMISSIONED) return { ok: false, reason: "commissioned", configured };
  return { ok: false, reason: "unknown", configured };
}
