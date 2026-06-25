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

/**
 * Parse a whitespace-DSL token as a non-negative integer index. Unlike
 * parseInt, this rejects signs, decimals, and trailing garbage: parseInt("-1")
 * is -1 and parseInt("0abc") is 0, both of which would otherwise build a wrong
 * (or crash-on-simulate) circuit. Leading zeros are accepted ("03" -> 3).
 */
export function parseIndex(
  tok: string | undefined
): { ok: true; value: number } | { ok: false } {
  if (tok === undefined || !/^\d+$/.test(tok)) return { ok: false };
  return { ok: true, value: Number(tok) };
}

/**
 * Parse a whitespace-DSL token as a finite float angle (radians). Rejects
 * trailing garbage that parseFloat would silently truncate ("1.5xyz" -> 1.5);
 * negative and exponent forms are allowed (rotations may be negative).
 */
export function parseAngle(
  tok: string | undefined
): { ok: true; value: number } | { ok: false } {
  if (tok === undefined || tok === "") return { ok: false };
  const v = Number(tok); // Number("1.5xyz") === NaN, Number("1e-3") === 0.001
  if (!Number.isFinite(v)) return { ok: false };
  return { ok: true, value: v };
}
