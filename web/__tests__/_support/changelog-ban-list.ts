/**
 * The rule-13 ban list for /changelog, and the matcher that applies it.
 *
 * Not a test file — it holds no assertions, and jest.config.ts excludes this
 * directory from collection (jest's default testMatch treats EVERY file under
 * __tests__ as a suite). It lives here rather than in web/src because nothing
 * ships it: it is scaffolding for three test files, not product code.
 *
 * Three surfaces have to be scanned, and each of them was unguarded at some
 * point in this feature's short history:
 *
 *   1. the CHANGELOG / CHANGELOG_ES data strings   (__tests__/lib/changelog.test.ts)
 *   2. the RENDERED page in both locales           (__tests__/components/changelog/…)
 *   3. the METADATA export                         (__tests__/app/changelog-page.test.tsx)
 *
 * Data alone is not enough: the page chrome (eyebrow, lede, empty state, the
 * "go and see it" link) is i18n copy that no data scan reads, and the metadata
 * export never enters the React tree at all — it becomes <meta name="description">
 * and the share-card fields, which is the copy most people read. Spec section 6
 * asks for rendered text in both locales, "in the shape the pricing page already
 * uses"; this is that shape, minus the import (nothing in the pricing test is
 * exported, and coupling the two would make either one's edits break the other).
 *
 * A BAN list, deliberately, and never a presence assertion. The 2026-08-17 audit
 * established that locking a promise's PRESENCE in a test is exactly how a
 * withdrawn promise outlived its withdrawal. Re-verify these when the storefront
 * opens; do not delete them.
 */

export interface BannedClaim {
  pattern: RegExp;
  why: string;
}

export const BANNED_CLAIMS: readonly BannedClaim[] = [
  {
    pattern:
      /\b(buy|purchase|top.?up|recharge)\b[\w\s]{0,100}\b(credits|plan|subscription|wallet|balance)\b/i,
    why: "the storefront is closed — no NEXT_PUBLIC_BILLING_URL in the live env",
  },
  {
    pattern:
      /\b(comprar|adquirir|recargar)\b[\w\s]{0,100}\b(créditos|plan|suscripción|cartera|saldo)\b/i,
    why: "the storefront is closed (Spanish)",
  },
  {
    pattern: /\b(run|execute)\b.{0,50}\bon\s+(quantum\s+)?hardware\b/i,
    why: "LIFETIME_CAP_MICROS is 0 — no learner can run a QPU task",
  },
  {
    pattern: /\bejecutar? .{0,20}en hardware\b/i,
    why: "no learner can run a QPU task (Spanish)",
  },
  { pattern: /sponsor\w*/i, why: "the sponsored-QPU promise was withdrawn 2026-07-28" },
  { pattern: /patrocin\w*/i, why: "the sponsored-QPU promise was withdrawn (Spanish)" },
];

/**
 * A denylist over raw text cannot see a negation, and the pricing page's guard
 * documents real sentences that were honest and still matched. So a match is a
 * hit only when nothing negates it — with two properties the first version of
 * this function lacked, each of which let ordinary marketing prose through:
 *
 *  - EVERY match is examined, not just the first. `pattern.exec` on a non-global
 *    regex returns match #1 and stops, so one negated early mention immunized
 *    every affirmative one after it: "You cannot buy credits yet. You can
 *    purchase a plan today." passed.
 *  - The negation window is the CLAUSE, not the sentence. Splitting on "." alone
 *    let a leading honest clause cover the rest of its own sentence, which is the
 *    single most common shape this prose takes: "Credits are not sold yet, but
 *    you can now top up your wallet." passed.
 *
 * Still a heuristic — "it is not the case that you can buy credits" defeats it —
 * and still far better than none. It is scoped to catch the sentences a person
 * writes when they are being careless, not the ones written to evade it.
 */
const NEGATION = /\b(no|not|never|cannot|can't|without|nunca|sin|tampoco)\b/i;

/** Clause boundaries, not just sentence boundaries. See the note above. */
const CLAUSE_BREAK = /[.!?;,]/g;

export function affirmativeHit(text: string, pattern: RegExp): boolean {
  return firstAffirmativeMatch(text, pattern) !== null;
}

/** The matched text of the first affirmative match, or null. */
export function firstAffirmativeMatch(text: string, pattern: RegExp): string | null {
  // A fresh global copy per call: `lastIndex` is mutable state on a shared
  // RegExp, and reusing a /g literal across call sites skips matches.
  const scan = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (const match of text.matchAll(scan)) {
    const clauseStart = clauseStartBefore(text, match.index ?? 0);
    if (!NEGATION.test(text.slice(clauseStart, match.index))) return match[0];
  }
  return null;
}

function clauseStartBefore(text: string, index: number): number {
  let start = 0;
  for (const brk of text.slice(0, index).matchAll(CLAUSE_BREAK)) {
    start = (brk.index ?? 0) + 1;
  }
  return start;
}

/**
 * Every banned claim `text` makes, as human-readable failures.
 *
 * All patterns are evaluated rather than failing on the first, because the first
 * to fire is not necessarily the one whose `why` names the real defect — the
 * pricing page's guard carries the same note for the same reason. `label` is
 * "which surface": a locale code for a rendered scan, a metadata path for the
 * export scan, an entry id for the data scan.
 */
export function bannedClaimHits(text: string, label: string): string[] {
  return BANNED_CLAIMS.flatMap(({ pattern, why }) => {
    const hit = firstAffirmativeMatch(text, pattern);
    return hit ? [`[${label}] advertised "${hit}" — ${why}`] : [];
  });
}
