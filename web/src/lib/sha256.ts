// Hex SHA-256 of a UTF-8 string, used to send the `x-amz-content-sha256` header
// that CloudFront Origin Access Control (OAC) requires for POST requests to a
// Lambda Function URL origin ("Lambda doesn't support unsigned payloads"). The
// hash CloudFront recomputes is over the EXACT request-body bytes, so callers
// must hash the same string they send as the body.
//
// crypto.subtle is only present in a secure context (HTTPS) — true for the
// deployed site. It is absent in some non-secure/test contexts, so callers should
// guard with `crypto?.subtle` and omit the header when it is unavailable rather
// than throwing (the same-origin/dev paths don't go through OAC).

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
