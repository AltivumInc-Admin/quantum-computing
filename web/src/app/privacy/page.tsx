import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { PrivacyPageContent } from "@/components/privacy/privacy-page-content";

export const metadata: Metadata = {
  title: `Privacy — ${SITE_NAME}`,
  description: `What ${SITE_NAME} stores (your email and learning progress), where it lives, what it never collects, and how to delete all of it.`,
};

/**
 * A plain-English, verifiable privacy page. Body copy is localized in
 * PrivacyPageContent; metadata stays English for SEO (public funnel).
 */
export default function PrivacyPage() {
  return <PrivacyPageContent />;
}
