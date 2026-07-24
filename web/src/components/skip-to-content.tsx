"use client";

import { useLocale } from "@/i18n";

/** Accessible skip link — client so the label tracks locale. */
export function SkipToContent() {
  const { t } = useLocale();
  return (
    <a
      href="#main"
      className="sr-only surface-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus-ring"
    >
      {t("nav.skipToContent")}
    </a>
  );
}
