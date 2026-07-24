import type { TFunction } from "./types";

/**
 * Localized section title from the dictionary, falling back to the manifest
 * title when the key is missing (new sections before translation lands).
 */
export function sectionTitle(
  t: TFunction,
  slug: string,
  fallback: string,
): string {
  const key = `sections.${slug}.title`;
  const value = t(key);
  return value === key ? fallback : value;
}

/** Localized gate pitch, falling back to the provided summary/pitch. */
export function sectionPitch(
  t: TFunction,
  slug: string,
  fallback: string,
): string {
  const key = `pitches.${slug}`;
  const value = t(key);
  return value === key ? fallback : value;
}
