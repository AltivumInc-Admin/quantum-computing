import { COHORT_LABEL, COHORT_SIZE, badgeSlug, type FoundingBadge } from "@/lib/founding-ten";

/** The public record for one issued badge. Deliberately plain: its job is to be
 *  checkable by someone who does not have an account and does not trust us. */
export function BadgeProof({ badge }: { badge: FoundingBadge }) {
  const label = COHORT_LABEL[badge.cohort];
  const serial = String(badge.serial).padStart(2, "0");
  const slug = badgeSlug(badge);
  const issued = new Date(`${badge.issuedAt}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  return (
    <article className="mx-auto max-w-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export: next/image does not optimize at build time, and the WebP derivative is pre-sized */}
      <img
        src={`/badges/${slug}.webp`}
        alt={`${label} badge, serial ${serial} of ${COHORT_SIZE}`}
        width={600}
        height={600}
        className="mx-auto w-full max-w-sm rounded-card"
      />

      <div className="mt-8 text-center">
        <p className="eyebrow eyebrow-mut">
          {label} · {serial} / {COHORT_SIZE}
        </p>
        <h1 className="mt-2 font-display text-display-lg tracking-tight text-(--ink)">
          {badge.holder}
        </h1>
        <p className="mt-3 text-sm text-(--mut)">
          Issued <time dateTime={badge.issuedAt}>{issued}</time>
        </p>
      </div>

      <p className="mt-8 border-t border-(--bd) pt-6 text-sm text-(--mut)">
        This record certifies that {badge.holder} holds {label} {serial} of{" "}
        {COHORT_SIZE} on Quantum Learner. The {label.toLowerCase()} cohort is limited
        to {COHORT_SIZE} places and is conferred by order of joining, not by
        coursework.
      </p>

      <p className="mt-4 text-sm text-caption">
        <a href={`/badges/${slug}.png`} download className="hover:underline focus-ring rounded">
          Download the full-resolution badge
        </a>
      </p>
    </article>
  );
}
