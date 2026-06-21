/**
 * Shared parse/validation helpers for the inline explorables that read an
 * optional JSON config from their fence body. These were previously copy-pasted
 * across the hybrid-jobs widgets (qparam / qjob / qcheckpoint) — `clamp` in
 * particular lived in two files — so they are single-sourced here.
 */

/** Clamp a number into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Round then clamp into [lo, hi]; NaN falls back to `lo`. */
export function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(v);
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Read a numeric field from a parsed JSON object: missing -> the fallback;
 * present-but-not-finite -> a typed error; otherwise clamped to [lo, hi].
 */
export function readNumber(
  obj: Record<string, unknown>,
  key: string,
  fallback: number,
  lo: number,
  hi: number
): { ok: true; value: number } | { ok: false; error: string } {
  const raw = obj[key];
  if (raw === undefined) return { ok: true, value: fallback };
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { ok: false, error: `"${key}" must be a finite number` };
  }
  return { ok: true, value: clamp(raw, lo, hi) };
}

/** Read a numeric field, falling back to `fallback` when missing or invalid. */
export function numberOr(
  obj: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const v = obj[key];
  if (v === undefined) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return v;
}
