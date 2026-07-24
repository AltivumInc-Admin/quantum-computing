"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { useLocale } from "@/i18n";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useLocale();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!mounted) return <div className="w-11 h-11" />;

  // resolvedTheme is always "light" | "dark" (never the stale "system" value), so
  // the icon and the toggle target stay correct under enableSystem.
  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control hover:bg-(--field) interactive focus-ring"
      aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
    >
      {isDark ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}
