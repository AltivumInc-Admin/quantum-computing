import Link from "next/link";
import { COHORT_LABEL, COHORT_SIZE, badgeSlug, cohortSlots, type Cohort } from "@/lib/founding-ten";

const COHORTS: Cohort[] = ["charter", "patron"];

const BLURB: Record<Cohort, string> = {
  charter: "The first ten members. Conferred by order of joining.",
  patron: "The first ten paying members. Conferred by order of subscribing.",
};

/** The whole cohort, issued and open. Showing the empty slots is the point:
 *  scarcity you can count is a claim a reader can check for themselves. */
export function Roster() {
  return (
    <div className="space-y-14">
      {COHORTS.map((cohort) => (
        <section key={cohort} aria-label={COHORT_LABEL[cohort]}>
          <h2 className="font-display text-display-md tracking-tight text-(--ink)">
            {COHORT_LABEL[cohort]}
          </h2>
          <p className="mt-1 text-sm text-(--mut)">{BLURB[cohort]}</p>

          <ul className="mt-6 divide-y divide-(--bd) border-y border-(--bd)">
            {cohortSlots(cohort).map((badge, i) => {
              const serial = String(i + 1).padStart(2, "0");
              return (
                <li key={serial} className="flex items-baseline justify-between gap-4 py-3">
                  <span className="font-mono text-sm tabular-nums text-caption">
                    {serial} / {COHORT_SIZE}
                  </span>
                  {badge ? (
                    <Link
                      href={`/founding-ten/${badgeSlug(badge)}`}
                      className="text-sm text-(--ink) hover:underline focus-ring rounded"
                    >
                      {badge.holder}
                    </Link>
                  ) : (
                    <span className="text-sm text-caption">Open</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
