import { TransitionLink } from "@/components/transition-link";
import { hueFor } from "@/lib/sections";

interface SectionCardProps {
  slug: string;
  index: number;
  title: string;
  summary: string;
  notebookCount: number;
}

// One hue per section is the single source of truth (sectionHue in lib/sections).
// The gradient bleed, the number badge, and the hover glow are all derived from
// this value in CSS (see .section-* classes in globals.css), so they always agree.
export function SectionCard({ slug, index, title, summary, notebookCount }: SectionCardProps) {
  const hue = hueFor(index);

  return (
    <TransitionLink
      href={`/learn/${slug}`}
      style={{ "--hue": hue } as React.CSSProperties}
      className="group relative block rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) backdrop-blur-md overflow-hidden interactive focus-ring shadow-(--shadow-resting) hover:-translate-y-1.5 hover:shadow-(--shadow-raised) hover:border-gray-300/80 dark:hover:border-white/[0.12] transition-all duration-300"
    >
      {/* Hover glow border */}
      <div className="section-glow absolute inset-[-1px] rounded-card opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Gradient bleed area */}
      <div className="section-bleed relative h-20 rounded-card">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-(--surface-1)" />
      </div>

      <div className="relative p-6 -mt-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="section-badge shrink-0 w-10 h-10 rounded-chip font-bold flex items-center justify-center text-base">
            {String(index).padStart(2, "0")}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums mt-1">
            {notebookCount} {notebookCount === 1 ? "notebook" : "notebooks"}
          </span>
        </div>

        <h3 className="font-display text-xl tracking-tight text-gray-900 dark:text-white leading-snug group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200">
          {title}
        </h3>

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
          {summary}
        </p>

        {/* Divider + Arrow indicator */}
        <div className="h-px bg-gradient-to-r from-gray-200/50 dark:from-gray-700/30 to-transparent mt-4 mb-4" />
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200">
          <span>Explore section</span>
          <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </TransitionLink>
  );
}
