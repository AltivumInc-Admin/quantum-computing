import { createHash } from "node:crypto";

/**
 * The ONE email normalization + hash for this repo.
 *
 * A holder is identified by the hash of their address, never by a Cognito sub:
 * one human can hold TWO accounts (a native record and a Google record) with
 * different subs — that is already true of someone in the pool today — so a
 * sub-keyed identity would pay one person twice and consume two slots. Hashing
 * also means no plaintext address is ever committed.
 *
 * This existed in four copies (web/src/lib/founding-ten.ts's normalizeEmail,
 * scripts/badge-email-hash.mjs, scripts/verify-founding-ten.mjs, and the
 * founding-credit issuer). Only two were parity-tested. Divergence here would
 * silently mint a SECOND marker row for the same person, so it is one function.
 */
export const normalizeEmail = (email) => String(email).trim().toLowerCase();

export const emailHash = (email) =>
  createHash("sha256").update(normalizeEmail(email)).digest("hex");
