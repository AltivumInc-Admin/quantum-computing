import type { RetentionSpectrum as Spectrum } from "@/lib/runbook";
import { RETENTION_STABILITY } from "@/lib/runbook";

/**
 * The Retention Spectrum — the page's thesis instrument. A histogram of every tracked
 * card's memory stability, split by a LABELLED 21-day threshold: bars neutral to the
 * LEFT of the line (maturing), accent to the RIGHT (retained). Retained-vs-maturing is
 * never carried by colour alone — the "21d" line is labelled, the axis is labelled, and
 * the full distribution is a real <table> inside a <details> (the ContributionGraph
 * precedent). Any non-zero bin clears a 2px floor so a count of 1 never renders as
 * nothing. NO growth animation: a chart that animates its own heights misreports its
 * data mid-load, so the bars carry no height transition.
 */
export function RetentionSpectrum({ spectrum }: { spectrum: Spectrum }) {
  const { bins, tracked, maturing, retained } = spectrum;
  const max = Math.max(1, ...bins.map((b) => b.count));
  // The 21d line sits at the boundary between the last maturing bin and the first
  // retained one — derived from the bins so it can never drift from the data.
  const retainedStart = bins.findIndex((b) => b.retained);
  const linePct = (retainedStart / bins.length) * 100;

  const label =
    `Retention spectrum: ${tracked} skill${tracked === 1 ? "" : "s"} tracked — ` +
    `${maturing} maturing (interval under ${RETENTION_STABILITY} days), ` +
    `${retained} retained (${RETENTION_STABILITY} days or more). By interval: ` +
    bins.map((b) => `${b.label} ${b.count}`).join(", ") + ".";

  return (
    <div className="mt-6">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-caption">
        Retention spectrum — skills by memory stability
      </p>

      {/* The chart: role="img" with the full text alternative; individual bars are
          decorative (the <details> table is the keyboard/SR path). */}
      <div className="relative mt-4">
        <div role="img" aria-label={label} className="grid h-32 items-end gap-2" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}>
          {bins.map((b) => {
            const pct = b.count === 0 ? 0 : (b.count / max) * 100;
            return (
              <div key={b.label} className="flex h-full flex-col items-center justify-end gap-1">
                <span aria-hidden="true" className="text-xs font-semibold tabular-nums text-gray-600 dark:text-gray-300">
                  {b.count > 0 ? b.count : ""}
                </span>
                <div
                  aria-hidden="true"
                  style={{ height: `${pct}%` }}
                  className={`w-full rounded-t-[3px] ${b.count > 0 ? "min-h-[2px]" : ""} ${
                    b.retained ? "bg-accent-dark dark:bg-accent" : "bg-gray-300 dark:bg-white/15"
                  }`}
                />
              </div>
            );
          })}
        </div>
        {/* The labelled threshold — the non-colour cue for retained vs maturing. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 border-l border-dashed border-warm-dark/70 dark:border-warm-light/70"
          style={{ left: `calc(${linePct}% - 4px)` }}
        >
          <span className="absolute -top-1 left-1 text-[0.62rem] font-semibold tracking-wide text-warm-dark dark:text-warm-light">
            {RETENTION_STABILITY}d
          </span>
        </div>
      </div>

      {/* Axis */}
      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {bins.map((b) => (
          <span key={b.label} className="text-center text-[0.62rem] text-caption tabular-nums">
            {b.label}
          </span>
        ))}
      </div>

      {/* Halves + footer */}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-gray-200/60 pt-3 text-xs text-caption dark:border-white/[0.06]">
        <span className="flex gap-4">
          <span>
            <span aria-hidden="true">← </span>maturing{" "}
            <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{maturing}</span>
          </span>
          <span className="text-accent-dark dark:text-accent-light">
            retained{" "}
            <span className="font-semibold tabular-nums">{retained}</span>
            <span aria-hidden="true"> →</span>
          </span>
        </span>
        <span className="tabular-nums">
          <span className="font-semibold text-gray-700 dark:text-gray-200">{tracked}</span> tracked
        </span>
      </div>

      <details className="mt-2 text-xs text-caption">
        <summary className="inline-flex cursor-pointer rounded-control px-1 py-0.5 focus-ring">
          View distribution
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">
              Tracked skills by memory-stability interval, split at the {RETENTION_STABILITY}-day
              retention threshold
            </caption>
            <thead>
              <tr className="text-gray-600 dark:text-gray-300">
                <th scope="col" className="py-1 pr-4 font-medium">Interval</th>
                <th scope="col" className="py-1 pr-4 font-medium">Skills</th>
                <th scope="col" className="py-1 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr key={b.label} className="border-t border-gray-200/60 dark:border-white/[0.06]">
                  <td className="py-1 pr-4">{b.label}</td>
                  <td className="py-1 pr-4">{b.count}</td>
                  <td className="py-1">{b.retained ? "retained" : "maturing"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
