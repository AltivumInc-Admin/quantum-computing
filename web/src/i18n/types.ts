/** Supported learner locales. Phase 1: English + Spanish. */
export type Locale = "en" | "es";

export const LOCALES: readonly Locale[] = ["en", "es"] as const;

export const DEFAULT_LOCALE: Locale = "en";

/** localStorage key — under the qc:* prefix so progress sync carries it. */
export const LOCALE_STORAGE_KEY = "qc:locale";

/** Nested dictionary: leaves are plain strings or plural forms. */
export type PluralForms = { one: string; other: string };

export type DictNode = string | PluralForms | { [key: string]: DictNode };

export type TranslationDict = { [key: string]: DictNode };

export type TranslateValues = Record<string, string | number>;

/**
 * Bound translator used by components and pure helpers that already know the
 * active locale. Pure — no React, no storage.
 */
export type TFunction = (
  key: string,
  values?: TranslateValues,
  count?: number,
) => string;
