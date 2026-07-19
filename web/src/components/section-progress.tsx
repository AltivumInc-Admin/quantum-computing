"use client";

import { useSectionComplete } from "@/hooks/use-progress";
import { toggleSectionComplete } from "@/lib/progress-store";

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

/**
 * A learner-driven "Mark as complete" toggle for the current lesson. Completion
 * is stored locally and broadcast through the shared progress channel so the
 * sidebar's checkmarks and overall progress bar update instantly. Clicking again
 * undoes completion.
 *
 * The house toggle idiom (code-block's wrap button): ONE state channel — a
 * stable accessible name with aria-pressed carrying the state. The APG button
 * pattern warns against flipping a toggle's label while aria-pressed is in
 * use (AT would double-encode: "Completed, pressed"), and a divergent constant
 * aria-label over a flipping visible label would fail WCAG 2.5.3 Label in
 * Name — so the visible label stays constant too, and the pressed state shows
 * as the filled check plus the section-hue styling.
 */
export function SectionProgress({ slug }: { slug: string }) {
  const complete = useSectionComplete(slug);

  return (
    <button
      type="button"
      onClick={() => toggleSectionComplete(slug)}
      aria-pressed={complete}
      className={`group inline-flex items-center gap-2.5 rounded-control px-4 py-2.5 text-sm font-medium interactive focus-ring transition-[color,background-color,border-color,box-shadow] duration-200 ${
        complete
          ? "border hue-border hue-soft-bg hue-text shadow-sm"
          : "border border-(--bd) text-(--mut) hover:border-accent/30 hover:bg-accent/5 hover:text-accent-dark dark:hover:text-accent-light"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300 ${
          complete
            ? "bg-accent-dark text-white shadow-sm shadow-accent/40"
            : "border border-(--bd-2) text-transparent group-hover:border-accent/50"
        }`}
      >
        <CheckIcon />
      </span>
      Mark as complete
    </button>
  );
}
