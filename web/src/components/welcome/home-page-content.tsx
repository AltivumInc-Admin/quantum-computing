"use client";

import Link from "next/link";
import { GLOSSARY } from "@/lib/glossary";
import { isAuthConfigured } from "@/lib/auth-config";
import { pitchFor } from "@/lib/section-pitch";
import { CurriculumGrid } from "@/components/curriculum-grid";
import { WelcomeHero } from "@/components/welcome/hero";
import { Band, BandImage, type FeatureBandProps } from "@/components/welcome/band";
import { TutorMock } from "@/components/welcome/tutor-mock";
import { PlaygroundMock } from "@/components/welcome/playground-mock";
import { useLocale } from "@/i18n";
import type { Section } from "@/lib/sections";

const PARTNERS = ["Amazon Braket", "PennyLane", "IonQ", "IQM", "QuEra", "Rigetti"];

export interface HomePageContentProps {
  sections: Section[];
  summaries: string[];
  notebookTotal: number;
}

function AuthCtas({
  align = "start",
  t,
}: {
  align?: "start" | "center";
  t: (key: string) => string;
}) {
  const configured = isAuthConfigured();
  const justify = align === "center" ? "justify-center" : "";
  return (
    <div className={`flex flex-wrap items-center gap-3 ${justify}`}>
      {configured ? (
        <>
          <Link
            href="/login?mode=signup"
            className="surface-accent inline-flex items-center rounded-control px-6 py-3 text-base font-semibold interactive focus-ring"
          >
            {t("home.signUpFree")}
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-control border border-white/20 px-6 py-3 text-base font-medium text-white hover:bg-white/5 hover:border-white/30 transition-colors interactive focus-ring"
          >
            {t("home.signIn")}
          </Link>
        </>
      ) : (
        <span className="inline-flex items-center rounded-control border border-white/15 px-6 py-3 text-base font-medium text-gray-300">
          {t("home.signUpSoon")}
        </span>
      )}
      <a
        href="#curriculum"
        className="inline-flex items-center px-2 py-3 text-base font-medium text-gray-300 hover:text-accent-light transition-colors interactive focus-ring rounded-control"
      >
        {t("home.exploreCurriculum")}
        <svg
          className="ml-1.5 w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </a>
    </div>
  );
}

/**
 * Client welcome surface — all learner-facing copy goes through t() so the
 * language selector updates the marketing page, not just chrome.
 * Server page.tsx only loads curriculum numbers + summaries.
 */
export function HomePageContent({
  sections,
  summaries,
  notebookTotal,
}: HomePageContentProps) {
  const { t } = useLocale();

  const bands: FeatureBandProps[] = [
    {
      kicker: t("home.bandPlaygroundKicker"),
      title: t("home.bandPlaygroundTitle"),
      body: t("home.bandPlaygroundBody"),
      href: "/playground",
      linkLabel: t("home.bandPlaygroundCta"),
      // The product demonstrating itself: a qsim program types itself and the
      // real parser + kernel + diagram recompute live — not a photograph.
      visual: <PlaygroundMock />,
    },
    {
      kicker: t("home.bandHardwareKicker"),
      title: t("home.bandHardwareTitle"),
      body: t("home.bandHardwareBody"),
      href: "/runbook",
      linkLabel: t("home.bandHardwareCta"),
      visual: (
        <BandImage
          src="/welcome/hardware.webp"
          alt="Gold-plated dilution refrigerator of a superconducting quantum computer, rim-lit in jade green against darkness"
        />
      ),
      flip: true,
    },
    {
      kicker: t("home.bandCurriculumKicker"),
      title: t("home.bandCurriculumTitle"),
      body: t("home.bandCurriculumBody", {
        notebooks: notebookTotal,
        sections: sections.length,
      }),
      href: "#curriculum",
      linkLabel: t("home.bandCurriculumCta"),
      visual: (
        <BandImage
          src="/welcome/bloch.webp"
          alt="Wireframe Bloch sphere of fine jade-green lines with a gold state-vector arrow, above faint interference ripples"
        />
      ),
    },
    {
      kicker: t("home.bandTutorKicker"),
      title: t("home.bandTutorTitle"),
      body: t("home.bandTutorBody"),
      href: "#curriculum",
      linkLabel: t("home.bandTutorCta"),
      visual: <TutorMock />,
      flip: true,
    },
  ];

  const toolkit = [
    {
      title: t("home.toolChallengesTitle"),
      body: t("home.toolChallengesBody"),
      href: null as string | null,
    },
    {
      title: t("home.toolReviewTitle"),
      body: t("home.toolReviewBody"),
      href: "/review",
    },
    {
      title: t("home.toolGlossaryTitle"),
      body: t("home.toolGlossaryBody", { count: GLOSSARY.length }),
      href: "/glossary",
    },
  ];

  return (
    <div className="relative">
      <WelcomeHero
        eyebrow={t("home.eyebrow")}
        headlineLead={t("home.headlineLead")}
        headlineDimPre={t("home.headlineDimPre")}
        headlineDimPost={t("home.headlineDimPost")}
        subtitle={t("home.subtitle")}
        ctas={<AuthCtas align="start" t={t} />}
        sections={sections.map((s, i) => ({
          slug: s.slug,
          index: s.index,
          title: s.title,
          summary: summaries[i] ?? "",
          countLabel: t("home.notebooksCount", { count: s.notebookCount }, s.notebookCount),
        }))}
        startHere={t("home.startHere")}
        dialLabel={t("home.dialLabel")}
        hudLive={t("home.hudLive")}
        hudCounts={t("home.hudCounts", { sections: sections.length, notebooks: notebookTotal })}
        microBadges={[t("home.badgeFree"), t("home.badgeInBrowser"), t("home.badgeNoInstall")]}
        blurbCta={t("home.dialOpenSection")}
        blurbClose={t("home.dialClose")}
      />

      <div className="dark bg-abyss px-3 sm:px-4">
        <div className="mx-auto max-w-6xl border-t border-white/[0.06] px-4 py-7">
          <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-3">
            <span className="eyebrow">
              {t("home.poweredBy")}
            </span>
            {PARTNERS.map((p) => (
              <span key={p} className="text-sm font-medium text-white/55">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-atmosphere" />
        <div className="absolute inset-0 bg-grid-dots [mask-image:radial-gradient(ellipse_70%_50%_at_50%_50%,black,transparent)]" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="flex items-center gap-4 mb-16 reveal">
            <h2 className="font-display text-display-xl text-(--ink)">
              {t("home.featuresHeading")}
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-(--bd) to-transparent" />
          </div>

          <div className="space-y-24">
            {bands.map((band) => (
              <Band key={band.kicker} {...band} />
            ))}
          </div>

          <div className="mt-24 grid gap-5 sm:grid-cols-3 reveal">
            {toolkit.map((tool) => {
              const inner = (
                <>
                  <h3 className="font-display text-display-md text-(--ink)">
                    {tool.title}
                  </h3>
                  <p className="mt-2 text-sm text-(--mut) leading-relaxed">
                    {tool.body}
                  </p>
                </>
              );
              const chrome =
                "block h-full rounded-card glass p-6 shadow-(--shadow-resting)";
              return tool.href ? (
                <Link
                  key={tool.title}
                  href={tool.href}
                  className={`${chrome} interactive focus-ring hover:-translate-y-1 hover:shadow-(--shadow-raised) transition-all duration-300`}
                >
                  {inner}
                </Link>
              ) : (
                <div key={tool.title} className={chrome}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="account-heading"
        className="dark relative overflow-hidden bg-abyss border-y border-white/[0.06]"
      >
        <div className="absolute inset-0 bg-atmosphere" />
        <div className="absolute inset-0 bg-grid-dots [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,black,transparent)]" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[820px] h-[420px] bg-[radial-gradient(ellipse_at_center,rgb(194,163,121,0.10),transparent_65%)] rounded-full blur-[90px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center reveal">
          <p className="eyebrow mb-4">
            {t("home.accountEyebrow")}
          </p>
          <h2
            id="account-heading"
            className="font-display text-display-xl tracking-tight text-white text-balance"
          >
            {t("home.accountHeading")}
          </h2>
          <p className="mt-5 text-lg text-gray-300 leading-relaxed">
            {t("home.accountBody")}
          </p>
          <div className="mt-9">
            <AuthCtas align="center" t={t} />
          </div>
          <p className="mt-6 text-sm text-gray-300">{t("home.accountReassurance")}</p>
        </div>
      </section>

      <section id="curriculum" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-atmosphere" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="flex items-center gap-4 mb-10 reveal">
            <h2 className="font-display text-display-xl text-(--ink)">
              {t("home.learningPath")}
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-(--bd) to-transparent" />
            <span className="text-sm text-caption tabular-nums">
              {t("home.sectionsCount", { count: sections.length }, sections.length)}
            </span>
          </div>
          <CurriculumGrid
            sections={sections.map((section, i) => {
              // Prefer short localized card copy; fall back to manifest title
              // and GUIDE teaser so a missing slug never blanks a card.
              const titleKey = `sections.${section.slug}.title`;
              const summaryKey = `sections.${section.slug}.summary`;
              const localizedTitle = t(titleKey);
              const localizedSummary = t(summaryKey);
              const title =
                localizedTitle === titleKey ? section.title : localizedTitle;
              const summary =
                localizedSummary === summaryKey
                  ? summaries[i] || t("home.summaryFallback")
                  : localizedSummary;
              return {
                slug: section.slug,
                index: section.index,
                title,
                notebookCount: section.notebookCount,
                runnableCount: section.runnableCount,
                summary,
                pitch: pitchFor(section.slug, summary),
              };
            })}
          />
        </div>
      </section>
    </div>
  );
}
