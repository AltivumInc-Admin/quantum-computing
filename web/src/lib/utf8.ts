// Pure UTF-8 byte helpers for the playground codec paths (share-URL payloads,
// QASM byte caps). Deliberately dependency-free — no TextEncoder — so behavior
// is identical in the browser, Node jest suites, and jsdom component tests
// (jsdom does not reliably expose TextEncoder). Lone surrogates encode as
// U+FFFD so the output is always well-formed UTF-8.

export function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // lone surrogate -> replacement
    if (c <= 0x7f) out.push(c);
    else if (c <= 0x7ff) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c <= 0xffff) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}

/** Strict decode; null (never a throw) on malformed, overlong, or out-of-range input. */
export function utf8Decode(bytes: readonly number[]): string | null {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i++];
    if (b0 <= 0x7f) {
      out += String.fromCharCode(b0);
      continue;
    }
    let extra: number, cp: number, min: number;
    if ((b0 & 0xe0) === 0xc0) [extra, cp, min] = [1, b0 & 0x1f, 0x80];
    else if ((b0 & 0xf0) === 0xe0) [extra, cp, min] = [2, b0 & 0x0f, 0x800];
    else if ((b0 & 0xf8) === 0xf0) [extra, cp, min] = [3, b0 & 0x07, 0x10000];
    else return null;
    if (i + extra > bytes.length) return null;
    for (let k = 0; k < extra; k++) {
      const b = bytes[i++];
      if ((b & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (b & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
  }
  return out;
}

/** Exact UTF-8 byte length (what Buffer.byteLength reports server-side). */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    bytes += c <= 0x7f ? 1 : c <= 0x7ff ? 2 : c <= 0xffff ? 3 : 4;
  }
  return bytes;
}
