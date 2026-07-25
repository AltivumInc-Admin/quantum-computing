"use client";

import { useLocale } from "@/i18n";

const LAST_UPDATED = "2026-07-12";
const CONTACT_EMAIL = "christian.perez@altivum.io";

export function PrivacyPageContent() {
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <header>
        <p className="mb-4 text-sm font-medium tracking-widest uppercase text-accent-dark dark:text-accent-light">
          {t("privacyUi.eyebrow")}
        </p>
        <h1 className="font-display text-display-2xl tracking-tight text-(--ink)">
          {t("privacyUi.title")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-gray-400">
          {t("privacyUi.lead")}
        </p>
      </header>

      <div className="mt-10 space-y-10">
        <Section title={t("privacyUi.whatWeStore")}>
          <p>{t("privacyUi.storeLocal")}</p>
          <p>{t("privacyUi.storeCircuits")}</p>
          <p>{t("privacyUi.storeServerIntro")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("privacyUi.storeEmail")}</li>
            <li>{t("privacyUi.storeProgress")}</li>
            <li>{t("privacyUi.storePrefs")}</li>
            <li>{t("privacyUi.storeHardware")}</li>
          </ul>
          <p>{t("privacyUi.storeTutor")}</p>
        </Section>

        <Section title={t("privacyUi.whatWeDont")}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("privacyUi.noAnalytics")}</li>
            <li>{t("privacyUi.noAds")}</li>
            <li>{t("privacyUi.noCookies")}</li>
            <li>{t("privacyUi.noThirdParty")}</li>
          </ul>
        </Section>

        <Section title={t("privacyUi.emails")}>
          <p>{t("privacyUi.emailsBody")}</p>
        </Section>

        <Section title={t("privacyUi.retention")}>
          <p>{t("privacyUi.retentionDelete")}</p>
          <p>{t("privacyUi.retentionLogs")}</p>
        </Section>

        <Section title={t("privacyUi.contact")}>
          <p>
            {t("privacyUi.contactBody")}{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-accent-dark dark:text-accent-light underline underline-offset-2 focus-ring rounded"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>

      <p className="mt-12 text-xs text-caption">
        {t("privacyUi.lastUpdated", { date: LAST_UPDATED })}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-(--ink)">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {children}
      </div>
    </section>
  );
}
