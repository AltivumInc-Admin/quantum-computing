import type { Locale } from "./types";

/**
 * BCP 47 tag for Intl formatters. Spanish targets Mexico (es-MX) per the
 * product spec — day/month order and number grouping.
 */
export function localeCode(locale: Locale): string {
  return locale === "es" ? "es-MX" : "en-US";
}
