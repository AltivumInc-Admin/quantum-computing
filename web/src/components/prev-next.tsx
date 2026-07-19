import { TransitionLink } from "@/components/transition-link";
import { getSections, type Section } from "@/lib/sections";

interface PrevNextProps {
  currentSlug: string;
}

// One card for both directions (the SidebarItem/CheckBadge pattern): the
// shared class string, label row, and chevron shell live once, and direction
// picks the ordering, alignment, and chevron path — so a restyle can't drift
// the two sides apart.
function PrevNextCard({
  section,
  direction,
}: {
  section: Section;
  direction: "prev" | "next";
}) {
  const isNext = direction === "next";
  const chevron = (
    <svg
      className="w-4 h-4 text-caption group-hover:text-accent shrink-0 transition-colors"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={isNext ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"}
      />
    </svg>
  );

  return (
    <TransitionLink
      href={`/learn/${section.slug}`}
      className={`group flex-1 flex items-center gap-3 p-4 rounded-xl border border-(--bd) hover:border-accent/30 dark:hover:border-accent/30 hover:bg-accent/5 interactive focus-ring transition-all duration-200 ${
        isNext ? "justify-end text-right" : ""
      }`}
    >
      {!isNext && chevron}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-caption font-medium">
          {isNext ? "Next" : "Previous"}
        </p>
        <p className="text-sm font-medium text-(--mut) group-hover:text-accent dark:group-hover:text-accent-light truncate transition-colors">
          {section.title}
        </p>
      </div>
      {isNext && chevron}
    </TransitionLink>
  );
}

export function PrevNext({ currentSlug }: PrevNextProps) {
  const sections = getSections();
  const currentIndex = sections.findIndex((s) => s.slug === currentSlug);
  // Unknown slug → no neighbors. Without this clamp, findIndex's -1 makes
  // sections[0] render as a confidently wrong "Next" card for any future
  // caller that skips slug validation.
  if (currentIndex === -1) return null;

  const prev: Section | undefined = sections[currentIndex - 1];
  const next: Section | undefined = sections[currentIndex + 1];

  return (
    // Stacked below sm — side by side, each card gets ~90px of title width at
    // 375px and four of the seven titles share the "Quantum" prefix, so the
    // truncated destinations become indistinguishable stubs.
    // No border-t here: the lesson footer's completion row (its only
    // composition) already opens the block with the one --bd hairline, so a
    // second rule ~100px below it would double the divider rhythm.
    <div className="flex flex-col sm:flex-row items-stretch justify-between gap-4 mt-16">
      {prev ? (
        <PrevNextCard section={prev} direction="prev" />
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <PrevNextCard section={next} direction="next" />
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}
