import { TransitionLink } from "@/components/transition-link";
import { getSections, type Section } from "@/lib/sections";

interface PrevNextProps {
  currentSlug: string;
}

export function PrevNext({ currentSlug }: PrevNextProps) {
  const sections = getSections();
  const currentIndex = sections.findIndex((s) => s.slug === currentSlug);
  const prev: Section | undefined = sections[currentIndex - 1];
  const next: Section | undefined = sections[currentIndex + 1];

  return (
    <div className="flex items-stretch justify-between gap-4 mt-16 pt-10 border-t border-gray-200/60 dark:border-gray-800/40">
      {prev ? (
        <TransitionLink
          href={`/learn/${prev.slug}`}
          className="group flex-1 flex items-center gap-3 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700/40 hover:border-accent/30 dark:hover:border-accent/30 hover:bg-accent/5 interactive focus-ring transition-all duration-200"
        >
          <svg className="w-4 h-4 text-gray-400 group-hover:text-accent shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium">Previous</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-accent dark:group-hover:text-accent-light truncate transition-colors">{prev.title}</p>
          </div>
        </TransitionLink>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <TransitionLink
          href={`/learn/${next.slug}`}
          className="group flex-1 flex items-center justify-end gap-3 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700/40 hover:border-accent/30 dark:hover:border-accent/30 hover:bg-accent/5 interactive focus-ring transition-all duration-200 text-right"
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium">Next</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-accent dark:group-hover:text-accent-light truncate transition-colors">{next.title}</p>
          </div>
          <svg className="w-4 h-4 text-gray-400 group-hover:text-accent shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </TransitionLink>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}
