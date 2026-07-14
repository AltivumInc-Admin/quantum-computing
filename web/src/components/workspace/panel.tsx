import type { ReactNode } from "react";

/**
 * The ONE card shell for /workspace — the margin-free, labelled region every zone
 * sits in. Extracted so the page (not its children) owns spacing: a grid is
 * impossible while children carry their own outer margins, and a labelled region
 * per panel is what gives the page its heading outline (each Panel is a landmark
 * via aria-labelledby to its own <h2>).
 *
 * Panels own NO outer margin — the grid gap and the column's space-y own the gaps.
 * The eyebrow <h2> doubles as the region's accessible name AND the visible label,
 * so a screen-reader user and a sighted user read the same title off the same node.
 */
export function Panel({
  title,
  id,
  sub,
  children,
  className = "",
  bodyClassName = "px-5 pb-5 pt-4",
  as: Tag = "section",
  headingRight,
}: {
  /** The eyebrow label — also the region's accessible name. */
  title: string;
  /** Stable id root; the heading gets `${id}-h` and labels the region. */
  id: string;
  /** Optional muted sub-line, right-aligned in the header (e.g. a live count). */
  sub?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** `aside` for the right rail's complementary panels; `section` (default) elsewhere. */
  as?: "section" | "aside";
  /** Optional interactive element pinned to the header's right (e.g. "Sync now"). */
  headingRight?: ReactNode;
}) {
  const headingId = `${id}-h`;
  return (
    <Tag
      aria-labelledby={headingId}
      className={`rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) shadow-(--shadow-resting) ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <h2
          id={headingId}
          className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-caption"
        >
          {title}
        </h2>
        {headingRight ?? (sub ? <span className="shrink-0 text-xs text-caption">{sub}</span> : null)}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}
