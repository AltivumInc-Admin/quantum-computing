"use client";

import type { CSSProperties } from "react";
import { TransitionLink } from "@/components/transition-link";
import { hueFor, getSectionBySlug } from "@/lib/sections";
import { sectionShortLabel, termSlug, type GlossaryTerm } from "@/lib/glossary";
import { InlineMarkdown } from "./inline-markdown";

export function GlossaryEntry({ term }: { term: GlossaryTerm }) {
  const section = getSectionBySlug(term.section);
  const hue = section ? hueFor(section.index) : 192;

  return (
    <article
      id={termSlug(term.term)}
      style={{ "--hue": hue } as CSSProperties}
      className="scroll-mt-24 py-5 border-b border-gray-200/50 dark:border-white/[0.06]"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h3 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
          {term.term}
        </h3>
        <TransitionLink
          href={`/learn/${term.section}`}
          className="hue-soft-bg hue-text rounded-chip px-2 py-0.5 text-xs font-medium interactive focus-ring"
        >
          {sectionShortLabel(term.section)}
        </TransitionLink>
      </div>
      <p className="mt-2 text-gray-600 dark:text-gray-300 leading-relaxed [&_code]:rounded [&_code]:bg-gray-100 dark:[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]">
        <InlineMarkdown>{term.definition}</InlineMarkdown>
      </p>
      {term.seeAlso && term.seeAlso.length > 0 ? (
        <p className="mt-2 text-xs text-gray-500">
          See also:{" "}
          {term.seeAlso.map((ref, i) => (
            <span key={ref}>
              <a href={`#${termSlug(ref)}`} className="hue-text hover:underline focus-ring rounded">
                {ref}
              </a>
              {i < term.seeAlso!.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
}
