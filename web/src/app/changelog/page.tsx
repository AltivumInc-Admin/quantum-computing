import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { ChangelogPageContent } from "@/components/changelog/changelog-page-content";

export const metadata: Metadata = {
  title: `Changelog — ${SITE_NAME}`,
  description: `What is new, what got better, and what got fixed in ${SITE_NAME} — every change a learner can see, newest first.`,
};

/**
 * The public record of what changed. Body copy is localized in
 * ChangelogPageContent; metadata stays English for SEO (public funnel).
 *
 * Deliberately NOT marked noindex, unlike the walled pages: a changelog nobody
 * can find is not a freshness signal. It is registered in PUBLIC_PATHS
 * (components/auth/auth-wall.tsx) and in the sitemap, and those two must always
 * agree — advertising a walled route only sends crawlers into a redirect.
 */
export default function ChangelogPage() {
  return <ChangelogPageContent />;
}
