import Link from "next/link";
import { Panel } from "./panel";
import { RetentionSpectrum } from "./retention-spectrum";
import type { WorkspaceModel } from "@/lib/workspace";

/**
 * Z1 — THE INSTRUMENT. The North-Star number (skills in proven retention) ALONE, in
 * display-2xl tabular-nums — no denominator, because "cards ever graded" is not a
 * meaningful target and rendering it as one is the trap. Below it, the Retention
 * Spectrum; or, below the sparse threshold where the histogram would look broken, an
 * honest hairline list of the tracked cards and their current intervals (which becomes
 * the spectrum as data accrues). Nothing here counts activity.
 */
export function Instrument({
  mastery,
  masteredThisWeek,
  spectrum,
  sparse,
}: Pick<WorkspaceModel, "mastery" | "masteredThisWeek" | "spectrum" | "sparse">) {
  return (
    <Panel title="Skills in proven retention" id="ws-instrument" sub="the mastery you can't cram">
      <dl>
        <dt className="sr-only">Skills in proven retention</dt>
        <dd className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display text-display-2xl leading-none tracking-tight text-gray-900 tabular-nums dark:text-white">
            {mastery}
          </span>
          <span className="sr-only">skills in proven retention</span>
          {masteredThisWeek > 0 && (
            <span className="text-sm font-medium text-accent-dark dark:text-accent-light">
              +{masteredThisWeek}{" "}
              <span className="font-normal text-caption">kept sharp this week</span>
            </span>
          )}
        </dd>
      </dl>

      {sparse !== null ? <SparseList sparse={sparse} /> : <RetentionSpectrum spectrum={spectrum} />}

      <div className="mt-3 text-right">
        <Link
          href="/runbook"
          className="text-xs font-medium text-accent-dark dark:text-accent-light interactive focus-ring rounded-control"
        >
          Full ledger →
        </Link>
      </div>
    </Panel>
  );
}

/**
 * The sparse fallback — honest and dense, never a pep talk. A hairline list of the
 * tracked cards and their current interval; it becomes the spectrum as data accrues.
 */
function SparseList({ sparse }: { sparse: { label: string; days: number }[] }) {
  if (sparse.length === 0) {
    return (
      <p className="mt-4 text-sm text-caption">
        No skills tracked yet — grade a Rep on a lesson and it lands here.
      </p>
    );
  }
  return (
    <ul className="mt-4 flex flex-col text-sm">
      {sparse.map((c, i) => (
        <li
          key={`${c.label}-${i}`}
          className="flex items-center justify-between gap-3 border-t border-gray-200/60 py-2 first:border-t-0 dark:border-white/[0.06]"
        >
          <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">{c.label}</span>
          <span className="shrink-0 tabular-nums text-caption">
            {c.days} d
          </span>
        </li>
      ))}
    </ul>
  );
}
