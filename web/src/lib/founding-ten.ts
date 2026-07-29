// Numbered scarcity credentials — see
// docs/superpowers/specs/2026-07-29-founding-ten-badges-design.md
//
// These are CONFERRED by position in time, not earned by study. They are
// deliberately NOT part of credentials.ts, whose medals are all derived from
// synced progress under the rule "Each medal is earned, not awarded".
//
// A badge binds to a hash of the holder's EMAIL, never to their Cognito sub: a
// sub identifies an account RECORD, and this project has seen both ways that
// breaks — an account deleted and recreated gets a new sub, and the same person
// arriving via native vs Google sign-in gets two. Email survives both and both
// auth methods carry it as an ID-token claim.
//
// The hash is not a privacy guarantee (emails are enumerable, so a guess can be
// tested against this file); it exists so the PUBLIC repo holds no address. The
// holder's name is already public on their proof page by consent.

import registry from "@/data/founding-ten.json";

export const COHORT_SIZE = 10;

export type Cohort = "charter" | "patron";

export interface FoundingBadge {
  cohort: Cohort;
  serial: number;
  holder: string;
  issuedAt: string;
  emailHash: string;
}

export const COHORT_LABEL: Record<Cohort, string> = {
  charter: "Charter Member",
  patron: "Founding Patron",
};

/** Exactly trim + lowercase. No provider-specific rules (Gmail dot-stripping,
 *  +tag removal): those differ per provider and would make the hash impossible
 *  to reproduce by hand at issue time. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** SHA-256 hex of the normalized email. Uses Web Crypto so the same function
 *  runs in the browser; scripts/badge-email-hash.mjs must produce identical
 *  output (asserted by a shared known vector). */
export async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeEmail(email));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** "charter-01" — zero-padded so slugs sort and read like the artwork. */
export function badgeSlug(b: Pick<FoundingBadge, "cohort" | "serial">): string {
  return `${b.cohort}-${String(b.serial).padStart(2, "0")}`;
}

export function allBadges(): FoundingBadge[] {
  return (["charter", "patron"] as const).flatMap((cohort) =>
    (registry[cohort] as Omit<FoundingBadge, "cohort">[]).map((b) => ({ ...b, cohort })),
  );
}

export function badgeBySlug(slug: string): FoundingBadge | null {
  return allBadges().find((b) => badgeSlug(b) === slug) ?? null;
}

/** Every badge held by one person — a holder may have one per cohort. */
export function badgeForEmailHash(hash: string): FoundingBadge[] {
  return allBadges().filter((b) => b.emailHash === hash);
}

/** All ten slots of a cohort, issued or open — the roster's model. */
export function cohortSlots(cohort: Cohort): (FoundingBadge | null)[] {
  const issued = allBadges().filter((b) => b.cohort === cohort);
  return Array.from(
    { length: COHORT_SIZE },
    (_, i) => issued.find((b) => b.serial === i + 1) ?? null,
  );
}
