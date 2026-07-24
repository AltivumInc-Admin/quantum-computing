"use client";

import { TransitionLink } from "@/components/transition-link";
import { termSlug } from "@/lib/glossary";
import { useLocale } from "@/i18n";

// Renders a term's "see also" cross-references as links to those terms' own pages.
export function SeeAlsoLinks({
  refs,
  labels,
}: {
  refs?: string[];
  /** English term → localized display label. */
  labels?: Record<string, string>;
}) {
  const { t } = useLocale();
  if (!refs || refs.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-caption">
      {t("glossaryUi.seeAlso")}:{" "}
      {refs.map((ref, i) => (
        <span key={ref}>
          <TransitionLink
            href={`/glossary/${termSlug(ref)}`}
            className="text-accent-dark dark:text-accent-light hover:underline focus-ring rounded"
          >
            {labels?.[ref] ?? ref}
          </TransitionLink>
          {i < refs.length - 1 ? ", " : ""}
        </span>
      ))}
    </p>
  );
}
