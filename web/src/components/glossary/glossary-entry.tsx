"use client";

import { TransitionLink } from "@/components/transition-link";
import { termSlug, type GlossaryTerm } from "@/lib/glossary";
import { InlineMarkdown } from "./inline-markdown";
import { CategoryChip } from "./category-chip";
import { SeeAlsoLinks } from "./see-also-links";

export function GlossaryEntry({ term }: { term: GlossaryTerm }) {
  return (
    <article
      id={termSlug(term.term)}
      className="scroll-mt-24 py-5 border-b border-gray-200/50 dark:border-white/[0.06]"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h3 className="font-display text-display-md tracking-tight">
          <TransitionLink
            href={`/glossary/${termSlug(term.term)}`}
            className="text-gray-900 dark:text-white hover:text-accent dark:hover:text-accent-light focus-ring rounded"
          >
            {term.term}
          </TransitionLink>
        </h3>
        <CategoryChip section={term.section} />
      </div>
      <p className="mt-2 text-gray-600 dark:text-gray-300 leading-relaxed [&_code]:rounded [&_code]:bg-gray-100 dark:[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]">
        <InlineMarkdown>{term.definition}</InlineMarkdown>
      </p>
      <SeeAlsoLinks refs={term.seeAlso} />
    </article>
  );
}
