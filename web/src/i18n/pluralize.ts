import type { Locale } from "./types";

/** Select the CLDR plural category for a count. Phase 1 locales share one/other. */
export type PluralCategory = "one" | "other";

export function pluralCategory(locale: Locale, n: number): PluralCategory {
  // English and Spanish both use singular only for exactly 1.
  void locale;
  return n === 1 ? "one" : "other";
}
