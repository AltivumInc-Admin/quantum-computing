import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WCAG 2.2 SC 2.5.8 (Target Size, Minimum) guard for the shared `.slider`.
 *
 * This has regressed once already and silently: PR #43 (WS-5a, da85e7d) grew
 * both thumbs 16px -> 24px with that SC cited in the commit message, the ledger
 * recorded the item closed, and then the Instrument restyle (PR #169, 26729d9)
 * rewrote the whole `.slider` block and put both thumbs back to 16px — on a
 * track that had also shrunk from h-1.5 to h-1, so the effective target was
 * WORSE than before the fix. Nothing failed, because no test ever evaluated the
 * geometry. One `.slider` recipe drives ~22 widget inputs plus both playground
 * panels and the two pricing sliders, so the blast radius is the whole platform.
 *
 * The rule measured here is the input's own border box (the pointer target),
 * OR the thumb if the thumb is the larger of the two. Never lower the 24
 * threshold to make a restyle pass — grow the hit box instead (the current
 * recipe keeps a 16px visual thumb inside a 24px transparent box, painting the
 * 4px rail as a centered background stripe).
 */

const CSS = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");

const MIN_TARGET_PX = 24;
/** Tailwind's spacing scale: `h-6` = 6 * 0.25rem = 1.5rem = 24px. */
const REM_PX = 16;
const SPACING_REM = 0.25;

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.:\-]/g, "\\$&");
  const m = CSS.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`rule not found: ${selector}`);
  return m[1];
}

/** Height of `.slider`'s own box, from its `@apply h-<n>` utility. */
function inputHeightPx(): number {
  const apply = ruleBody(".slider").match(/@apply([^;]*);/);
  if (!apply) throw new Error(".slider has no @apply directive");
  const h = apply[1].match(/(?:^|\s)h-(\d+(?:\.\d+)?)(?:\s|$)/);
  if (!h) throw new Error(".slider @apply carries no h-* height utility");
  return parseFloat(h[1]) * SPACING_REM * REM_PX;
}

function thumbSizePx(selector: string): { width: number; height: number } {
  const body = ruleBody(selector);
  const w = body.match(/(?:^|[\s;])width:\s*(\d+(?:\.\d+)?)px/);
  const h = body.match(/(?:^|[\s;])height:\s*(\d+(?:\.\d+)?)px/);
  if (!w || !h) throw new Error(`${selector} has no explicit px width/height`);
  return { width: parseFloat(w[1]), height: parseFloat(h[1]) };
}

describe(".slider target size (WCAG 2.5.8)", () => {
  const webkit = thumbSizePx(".slider::-webkit-slider-thumb");
  const moz = thumbSizePx(".slider::-moz-range-thumb");

  it.each([
    ["webkit", () => webkit],
    ["moz", () => moz],
  ])("%s: the effective grab target is at least 24px tall", (_name, get) => {
    const thumb = get();
    expect(Math.max(inputHeightPx(), thumb.height)).toBeGreaterThanOrEqual(
      MIN_TARGET_PX,
    );
  });

  it("keeps the webkit and moz thumbs the same size (one visual control)", () => {
    expect(webkit).toEqual(moz);
  });

  it("does not paint the rail with the input's full-box background", () => {
    // The 24px box must stay visually a hairline: if a future edit sets a flat
    // `background: var(--track)` again, the control renders as a 24px slab.
    const body = ruleBody(".slider");
    expect(body).not.toMatch(/background:\s*var\(--track\)\s*;/);
  });
});
