// The playground's share codec: the whole circuit lives in the URL fragment as
// #c=<base64url of JSON {v:1, name?, src}>. The hash (never a query string) is
// deliberate for a static export — it never reaches the server or the CDN
// cache key, and it needs no Suspense boundary. The DSL source itself is the
// canonical payload (Quirk/IBM both settled on source-in-URL), so a share link
// is also a bookmark, a save file, and a lesson deep-link.
//
// Decoding is hostile-input-safe: URL payloads are unbounded user content, so
// everything is capped and every failure returns null — callers fall back to
// the default circuit, never crash.

import { utf8Decode, utf8Encode } from "./utf8";

export type SharePayload = { name?: string; src: string; t?: number };

export const MAX_SHARE_SRC = 4000;
export const MAX_SHARE_NAME = 80;
/** Theta's clamp ceiling — the compose slider's own upper bound. */
export const MAX_SHARE_THETA = 2 * Math.PI;

/**
 * Validate-on-read discipline for a persisted theta (shared with the circuit
 * store): finite numbers clamp to the slider's [0, 2π] range; anything else —
 * strings, NaN, Infinity (both JSON.stringify to null), missing — is absent,
 * and callers fall back to the pi/2 default.
 */
export function sanitizeTheta(t: unknown): number | undefined {
  if (typeof t !== "number" || !Number.isFinite(t)) return undefined;
  return Math.min(Math.max(t, 0), MAX_SHARE_THETA);
}
// A base64url payload longer than this cannot decode to an in-cap circuit.
const MAX_PAYLOAD_CHARS = 24000;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_INDEX: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_INDEX[B64[i]] = i;

function toBase64Url(bytes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64[b2 & 0x3f];
  }
  return out; // unpadded — '=' never appears in the fragment
}

function fromBase64Url(s: string): number[] | null {
  if (s.length % 4 === 1) return null; // impossible unpadded length
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64_INDEX[ch];
    if (v === undefined) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

/** Fragment body (no leading '#') encoding this circuit, e.g. "c=eyJ2IjoxLC...". */
export function encodeShareHash(p: SharePayload): string {
  const payload: { v: 1; name?: string; src: string; t?: number } = { v: 1, src: p.src };
  if (p.name !== undefined && p.name !== "") payload.name = p.name;
  // Still v:1 — t is additive and optional, so old decoders and old links both
  // keep working. Six decimals matches the QASM compiler's angle precision and
  // keeps the fragment short.
  if (p.t !== undefined && Number.isFinite(p.t)) payload.t = Math.round(p.t * 1e6) / 1e6;
  return `c=${toBase64Url(utf8Encode(JSON.stringify(payload)))}`;
}

/** Tolerant of a leading '#' and of sibling fragment params; null on anything invalid. */
export function decodeShareHash(hash: string): SharePayload | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const match = /(?:^|&)c=([A-Za-z0-9_-]+)/.exec(h);
  if (!match || match[1].length > MAX_PAYLOAD_CHARS) return null;
  const bytes = fromBase64Url(match[1]);
  if (!bytes) return null;
  const json = utf8Decode(bytes);
  if (json === null) return null;
  try {
    const obj = JSON.parse(json) as { v?: unknown; name?: unknown; src?: unknown; t?: unknown };
    if (obj.v !== 1) return null;
    if (typeof obj.src !== "string" || obj.src.length === 0 || obj.src.length > MAX_SHARE_SRC) {
      return null;
    }
    const name =
      typeof obj.name === "string" && obj.name.length > 0 && obj.name.length <= MAX_SHARE_NAME
        ? obj.name
        : undefined;
    // Like a bad name, a bad theta is DROPPED but the circuit survives.
    const t = sanitizeTheta(obj.t);
    const out: SharePayload = { src: obj.src };
    if (name !== undefined) out.name = name;
    if (t !== undefined) out.t = t;
    return out;
  } catch {
    return null;
  }
}
