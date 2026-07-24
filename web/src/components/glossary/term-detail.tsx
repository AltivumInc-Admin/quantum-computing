"use client";

import { TransitionLink } from "@/components/transition-link";
import {
  termsInSection,
  termSlug,
  type GlossaryTerm,
} from "@/lib/glossary";
import { GLOSSARY_ES, GLOSSARY_TERM_ES } from "@/lib/glossary-es";
import { InlineMarkdown } from "./inline-markdown";
import { CategoryChip } from "./category-chip";
import { SeeAlsoLinks } from "./see-also-links";
import { CopyLinkButton } from "./copy-link-button";
import { WorkspaceCta } from "./workspace-cta";
import { useLocale } from "@/i18n";

export function TermDetail({ term }: { term: GlossaryTerm }) {
  const { locale, t } = useLocale();
  const related = termsInSection(term.section, term.term);
  const displayTerm =
    locale === "es" ? (GLOSSARY_TERM_ES[term.term] ?? term.term) : term.term;
  const definition =
    locale === "es" ? (GLOSSARY_ES[term.term] ?? term.definition) : term.definition;
  const seeAlsoLabels = Object.fromEntries(
    (term.seeAlso ?? []).map((r) => [
      r,
      locale === "es" ? (GLOSSARY_TERM_ES[r] ?? r) : r,
    ]),
  );
  const sectionLabel = t(`glossaryUi.short.${term.section}`);

  return (
    <article>
      <TransitionLink
        href="/glossary"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-accent dark:hover:text-accent-light interactive focus-ring rounded"
      >
        <svg
          aria-hidden="true"
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t("glossaryUi.allTerms")}
      </TransitionLink>

      <h1 className="mt-4 font-display text-display-2xl tracking-tight text-(--ink)">
        {displayTerm}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <CategoryChip section={term.section} />
        <CopyLinkButton />
      </div>

      <div className="mt-6 text-lg text-gray-700 dark:text-gray-200 leading-relaxed [&_code]:rounded [&_code]:bg-gray-100 dark:[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]">
        <InlineMarkdown>{definition}</InlineMarkdown>
      </div>

      <SeeAlsoLinks refs={term.seeAlso} labels={seeAlsoLabels} />

      {related.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-display-md tracking-tight text-(--ink)">
            {t("glossaryUi.moreIn", { section: sectionLabel })}
          </h2>
          <ul role="list" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {related.map((item) => (
              <li key={item.term}>
                <TransitionLink
                  href={`/glossary/${termSlug(item.term)}`}
                  className="text-accent-dark dark:text-accent-light hover:underline focus-ring rounded"
                >
                  {locale === "es"
                    ? (GLOSSARY_TERM_ES[item.term] ?? item.term)
                    : item.term}
                </TransitionLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <WorkspaceCta />
    </article>
  );
}
