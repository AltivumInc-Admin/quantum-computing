import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allBadges, badgeBySlug, badgeSlug, COHORT_LABEL, COHORT_SIZE } from "@/lib/founding-ten";
import { articleMetadata } from "@/lib/seo";
import { BadgeProof } from "@/components/founding-ten/badge-proof";

interface PageProps {
  params: Promise<{ badge: string }>;
}

export const dynamicParams = false;

/** Only ISSUED badges get a page — an open slot has no record to show. */
export function generateStaticParams() {
  return allBadges().map((b) => ({ badge: badgeSlug(b) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { badge: slug } = await params;
  const badge = badgeBySlug(slug);
  if (!badge) return { title: "Not Found" };
  const label = COHORT_LABEL[badge.cohort];
  const serial = String(badge.serial).padStart(2, "0");
  return articleMetadata({
    title: `${label} ${serial}/${COHORT_SIZE} — ${badge.holder}`,
    ogTitle: `${badge.holder} — ${label} ${serial}/${COHORT_SIZE}`,
    description: `Proof of record: ${badge.holder} holds ${label} ${serial} of ${COHORT_SIZE} on Quantum Learner, issued ${badge.issuedAt}.`,
    path: `/founding-ten/${slug}`,
  });
  // NOTE: unlike /glossary/[term], this page is deliberately INDEXABLE. It is
  // proof of record; a credential nobody can find is not proof of anything.
}

export default async function BadgeProofPage({ params }: PageProps) {
  const { badge: slug } = await params;
  const badge = badgeBySlug(slug);
  if (!badge) notFound();
  return (
    <div className="px-4 py-16">
      <BadgeProof badge={badge} />
    </div>
  );
}
