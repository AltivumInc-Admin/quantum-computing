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
          : "border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:border-accent/30 hover:bg-accent/5 hover:text-accent-dark dark:hover:text-accent-light"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300 ${
          complete
            ? "bg-accent text-white shadow-sm shadow-accent/40"
            : "border border-gray-300 text-transparent dark:border-gray-600 group-hover:border-accent/50"
        }`}
      >
        <CheckIcon />
      </span>
      {complete ? "Completed" : "Mark as complete"}
    </button>
  );
}
