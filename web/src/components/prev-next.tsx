import Link from "next/link";
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
    <div className="flex items-center justify-between mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
      {prev ? (
        <Link
          href={`/learn/${prev.slug}`}
          className="group flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-accent transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>{prev.title}</span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/learn/${next.slug}`}
          className="group flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-accent transition-colors"
        >
          <span>{next.title}</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
