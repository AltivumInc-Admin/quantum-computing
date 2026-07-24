"use client";

import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { SITE_FOOTER_ID } from "@/lib/layout-regions";
import { useLocale } from "@/i18n";

const REPO_URL = "https://github.com/AltivumInc-Admin/quantum-computing";

const linkClass =
  "text-gray-600 dark:text-gray-400 hover:text-accent dark:hover:text-accent-light interactive focus-ring rounded transition-colors";

export function Footer() {
  const { t } = useLocale();
  return (
    <footer
      id={SITE_FOOTER_ID}
      className="mt-24 border-t border-gray-200/60 dark:border-gray-800/40"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-caption">
          {t("footer.tagline", { site: SITE_NAME })}
        </p>
        <nav
          aria-label={t("footer.ariaLabel")}
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium"
        >
          <Link href="/playground" className={linkClass}>
            {t("nav.playground")}
          </Link>
          <Link href="/runbook" className={linkClass}>
            {t("nav.runbook")}
          </Link>
          <Link href="/credentials" className={linkClass}>
            {t("nav.credentials")}
          </Link>
          <Link href="/glossary" className={linkClass}>
            {t("nav.glossary")}
          </Link>
          <Link href="/review" className={linkClass}>
            {t("nav.review")}
          </Link>
          <Link href="/pricing" className={linkClass}>
            {t("nav.pricing")}
          </Link>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {t("nav.github")}
          </a>
          <Link
            href="/privacy"
            className="text-caption hover:text-accent dark:hover:text-accent-light interactive focus-ring rounded transition-colors"
          >
            {t("nav.privacy")}
          </Link>
        </nav>
      </div>
      <p className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 text-xs text-caption">
        {t("footer.builtWith")}
      </p>
    </footer>
  );
}
