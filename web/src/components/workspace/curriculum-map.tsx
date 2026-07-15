import Link from "next/link";
import { Panel } from "./panel";
import type { WorkspaceSection } from "@/lib/workspace";

/**
 * Z4 — THE MAP, the PLAN surface. Seven dense rows, not marketing cards: a 3px hue
 * rail, zero-padded index, the FULL module title (truncated visually, but the full
 * string is the link's accessible name), notebook + browser-runnable counts, and a
 * status WORD + glyph — never colour alone. The whole row is the Link. An "in progress"
 * state is not derivable today (no signal exists), so there are exactly two honest
 * states, never a faked third.
 */
export function CurriculumMap({
  sections,
  sectionsDone,
}: {
  sections: WorkspaceSection[];
  sectionsDone: number;
}) {
  return (
    <Panel
      title="Curriculum"
      id="ws-map"
      sub={`${sectionsDone} of ${sections.length} modules complete`}
      bodyClassName="px-5 pb-4 pt-2"
    >
      <ul className="flex flex-col">
        {sections.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/learn/${s.slug}`}
              aria-label={`${s.title} — ${s.done ? "done" : "open"}`}
              className="relative flex items-center gap-3 border-t border-gray-200/60 py-2.5 pl-3.5 interactive focus-ring rounded-control dark:border-white/[0.06] [li:first-child_&]:border-t-0"
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: `oklch(0.62 0.16 ${s.hue})` }}
                className="absolute inset-y-2 left-0 w-[3px] rounded-full"
              />
              <span className="min-w-[1.4rem] shrink-0 text-sm font-semibold tabular-nums text-caption">
                {String(s.index).padStart(2, "0")}
              </span>
              <span
                title={s.title}
                className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100"
              >
                {s.title}
              </span>
              <span className="hidden shrink-0 text-xs tabular-nums text-caption sm:inline">
                {s.notebookCount} nb · {s.runnableCount} run
              </span>
              <Status done={s.done} />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Status({ done }: { done: boolean }) {
  if (!done) {
    return <span className="shrink-0 text-xs font-semibold text-caption">Open</span>;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent-dark dark:text-accent-light">
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Done
    </span>
  );
}
