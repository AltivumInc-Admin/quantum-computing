"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Locale, TFunction, TranslateValues } from "./types";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from "./types";
import { translate } from "./translate";
import { isLocale, readStoredLocale, writeStoredLocale } from "./storage";

/** Same-tab locale changes (storage events only fire across tabs). */
const LOCALE_EVENT = "qc-locale-change";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function subscribeLocale(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCALE_STORAGE_KEY || e.key === null) onStoreChange();
  };
  const onLocal = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCALE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCALE_EVENT, onLocal);
  };
}

function getClientLocale(): Locale {
  return readStoredLocale();
}

function getServerLocale(): Locale {
  return DEFAULT_LOCALE;
}

/**
 * Learner locale preference — mirrors next-themes' role for color scheme.
 * Persists under qc:locale (syncs with progress), updates <html lang>, and
 * provides a bound t() for the tree.
 *
 * Locale is read via useSyncExternalStore (not useEffect+setState) so the
 * static-export prerender stays on "en" and the client hydrates from storage
 * without cascading-render lint failures.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeLocale,
    getClientLocale,
    getServerLocale,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    writeStoredLocale(next);
    document.documentElement.lang = next;
    window.dispatchEvent(new Event(LOCALE_EVENT));
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
