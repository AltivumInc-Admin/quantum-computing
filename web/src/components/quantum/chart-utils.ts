/**
 * Pure SVG line-chart math shared by the chart-bearing explorables (barren,
 * pes, metrics, vqe, vqc-trainer). Rendering — axes, gridlines, tick labels —
 * stays chart-specific in each view; these helpers own only the scaffolding
 * every chart had re-derived: extents, linear scales, path strings, and the
 * padded-frame arithmetic.
 */

/**
 * Single-pass min/max. Throws on an empty array: every chart guards its data
 * before scaling, so an empty extent is a caller bug, not a state to encode.
 */
export function extent(values: number[]): { min: number; max: number } {
  if (values.length === 0) throw new Error("extent() requires a non-empty array");
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Linear map from domain [d0, d1] to range [r0, r1]. Either pair may be
 * inverted — the energy charts flip by passing the HIGH domain value as d0.
 * Computed as ratio-then-multiply, matching the formula every chart already
 * used, so adopted call sites stay float-identical (pixel-identical paths).
 * A degenerate domain (d1 === d0) is the caller's concern: every chart pads
 * or floors its span before scaling.
 */
export function linearScale(
  d0: number,
  d1: number,
  r0: number,
  r1: number
): (v: number) => number {
  return (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

/**
 * `M x,y L x,y …` path string; `digits` preserves each chart's precision.
 * An empty input yields `""` — a valid no-op `d` and a falsy value callers use
 * as a render guard (metrics renders nothing pre-stream). Deliberately NOT
 * fail-loud like `extent`: an empty series is a real chart state, not a bug.
 */
export function linePath(pts: Array<{ x: number; y: number }>, digits = 2): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(digits)},${p.y.toFixed(digits)}`)
    .join(" ");
}

/**
 * `"x,y x,y …"` for a `<polyline points>` attribute (barren keeps 1 digit).
 * Empty input yields `""`, same contract as `linePath`.
 */
export function polylinePoints(pts: Array<{ x: number; y: number }>, digits = 1): string {
  return pts.map((p) => `${p.x.toFixed(digits)},${p.y.toFixed(digits)}`).join(" ");
}

/** A padded chart frame: outer size + per-side padding (values differ per chart). */
export interface Plot {
  w: number;
  h: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

/** Inner drawable size of a Plot frame. */
export function plotInner(p: Plot): { innerW: number; innerH: number } {
  return { innerW: p.w - p.padL - p.padR, innerH: p.h - p.padT - p.padB };
}
