"use client";

import { useLocale } from "@/i18n";

export function GlossaryPageHeader() {
  const { t } = useLocale();
  return (
    <header className="mb-8">
      <p className="eyebrow mb-4">
        {t("home.glossaryEyebrow")}
      </p>
      <h1 className="font-display text-display-2xl tracking-tight text-(--ink)">
        {t("glossaryUi.pageTitle")}
      </h1>
      <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
        {t("glossaryUi.pageBody")}
      </p>
    </header>
  );
}
