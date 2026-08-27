"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { COHORT_LABEL, COHORT_SIZE, badgeForEmailHash, badgeSlug } from "@/lib/founding-ten";

/** The holder's own badges, above the earned medals and visually apart from
 *  them. Copy says CONFERRED, never earned: the medals below are derived from
 *  real work, and blurring the two would cheapen them. */
export function MyFoundingBadges() {
  const { emailHash } = useAuth();
  const badges = emailHash ? badgeForEmailHash(emailHash) : [];
  if (badges.length === 0) return null;

  return (
    <section aria-label="Founding Ten" className="mb-12">
      <h2 className="eyebrow eyebrow-mut">
        Founding Ten
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {badges.map((badge) => {
          const slug = badgeSlug(badge);
          const serial = String(badge.serial).padStart(2, "0");
          return (
            <div
              key={slug}
              className="flex items-center gap-4 rounded-card border border-gray-200/60 bg-(--surface-1) p-4 shadow-(--shadow-resting) dark:border-white/[0.06]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
              <img
                src={`/badges/${slug}.webp`}
                alt=""
                width={96}
                height={96}
                className="size-24 shrink-0 rounded-control"
              />
              <div className="min-w-0">
                <p className="font-display text-sm text-(--ink)">
                  {COHORT_LABEL[badge.cohort]} {serial} / {COHORT_SIZE}
                </p>
                <p className="mt-0.5 text-sm text-(--mut)">
                  Conferred {badge.issuedAt}
                </p>
                <Link
                  href={`/founding-ten/${slug}`}
                  className="mt-2 inline-block text-sm text-accent-dark hover:underline focus-ring rounded dark:text-accent-light"
                >
                  View public record
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
