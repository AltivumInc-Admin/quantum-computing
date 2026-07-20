/**
 * Shared parse/validation helpers for the inline explorables that read an
 * optional JSON config from their fence body. These were previously copy-pasted
 * across the hybrid-jobs widgets (qparam / qjob / qcheckpoint) — `clamp` in
 * particular lived in two files — so they are single-sourced here.
 */

import { clamp } from "./math";
export { clamp };

/** Round then clamp into [lo, hi]; NaN falls back to `lo`. */
export function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(v);
  if (Number.isNaN(n)) return lo;
  return clamp(n, lo, hi);
}

/**
 * Parse the optional JSON-object config body shared by every fenced explorable.
 * Empty/whitespace -> { ok: true, obj: null } (caller substitutes its defaults);
 * a JSON object -> { ok: true, obj }; anything else -> { ok: false, error }.
 */
export function parseJsonObject(
  source: string
): { ok: true; obj: Record<string, unknown> | null } | { ok: false; error: string } {
  const trimmed = source.trim();
  if (trimmed.length === 0) return { ok: true, obj: null };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "expected a JSON object" };
  }
  return { ok: true, obj: raw as Record<string, unknown> };
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

/**
 * Read a numeric field that must fall inside a closed range: missing -> the
 * fallback; present-but-not-finite or out-of-range -> a typed error. The
 * erroring twin of `readNumber` (which clamps instead), for the fence bodies
 * where silently moving an author's value would be worse than telling them.
 * `unit` is appended to the range message; pass it lowercase ("angstrom"), the
 * spelling format.ts's angstromSR/hartreeSR use and hamiltonian-explorer's
 * suite pins.
 */
export function readNumberInRange(
  obj: Record<string, unknown>,
  key: string,
  fallback: number,
  lo: number,
  hi: number,
  unit?: string
): { ok: true; value: number } | { ok: false; error: string } {
  const raw = obj[key];
  if (raw === undefined) return { ok: true, value: fallback };
  const suffix = unit ? ` (${unit})` : "";
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { ok: false, error: `"${key}" must be a finite number${suffix}` };
  }
  if (raw < lo || raw > hi) {
    return { ok: false, error: `"${key}" must be within [${lo}, ${hi}]${unit ? ` ${unit}` : ""}` };
  }
  return { ok: true, value: raw };
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
