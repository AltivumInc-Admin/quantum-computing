"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Locale, TFunction, TranslateValues } from "./types";
import { DEFAULT_LOCALE } from "./types";
import { translate } from "./translate";
import { readStoredLocale, writeStoredLocale } from "./storage";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Learner locale preference — mirrors next-themes' role for color scheme.
 * Persists under qc:locale (syncs with progress), updates <html lang>, and
 * provides a bound t() for the tree.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  // Start at the default so SSR/static export and the first client paint match;
  // then hydrate from storage (same flicker class as next-themes).
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLocaleState(readStoredLocale());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = locale;
  }, [locale, hydrated]);

  // Cross-tab: another tab changed qc:locale.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "qc:locale") return;
      if (e.newValue === "en" || e.newValue === "es") {
        setLocaleState(e.newValue);
      } else if (e.newValue === null) {
        setLocaleState(DEFAULT_LOCALE);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
    document.documentElement.lang = next;
  }, []);

  const t: TFunction = useCallback(
    (key: string, values?: TranslateValues, count?: number) =>
      translate(locale, key, values, count),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Safe fallback for tests that render without the provider: English only.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, values, count) => translate(DEFAULT_LOCALE, key, values, count),
    };
  }
  return ctx;
}
