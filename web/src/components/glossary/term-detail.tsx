import { TransitionLink } from "@/components/transition-link";
import { termsInSection, termSlug, sectionShortLabel, type GlossaryTerm } from "@/lib/glossary";
import { InlineMarkdown } from "./inline-markdown";
import { CategoryChip } from "./category-chip";
import { SeeAlsoLinks } from "./see-also-links";
import { CopyLinkButton } from "./copy-link-button";
import { WorkspaceCta } from "./workspace-cta";

export function TermDetail({ term }: { term: GlossaryTerm }) {
  const related = termsInSection(term.section, term.term);

  return (
    <article>
      <TransitionLink
        href="/glossary"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-accent dark:hover:text-accent-light interactive focus-ring rounded"
      >
        <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All terms
      </TransitionLink>

      <h1 className="mt-4 font-display text-display-2xl tracking-tight text-(--ink)">
        {term.term}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <CategoryChip section={term.section} />
        <CopyLinkButton />
      </div>

      <div className="mt-6 text-lg text-gray-700 dark:text-gray-200 leading-relaxed [&_code]:rounded [&_code]:bg-gray-100 dark:[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]">
        <InlineMarkdown>{term.definition}</InlineMarkdown>
      </div>

      <SeeAlsoLinks refs={term.seeAlso} />

      {related.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-display-md tracking-tight text-(--ink)">
            More in {sectionShortLabel(term.section)}
          </h2>
          <ul role="list" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {related.map((t) => (
              <li key={t.term}>
                <TransitionLink
                  href={`/glossary/${termSlug(t.term)}`}
                  className="text-accent-dark dark:text-accent-light hover:underline focus-ring rounded"
                >
                  {t.term}
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
