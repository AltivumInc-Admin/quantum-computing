import type { Metadata } from "next";
import { getSections } from "@/lib/sections";
import { getContentSummary } from "@/lib/content";
import { SITE_NAME, OG_IMAGE } from "@/lib/site";
import { HomePageContent } from "@/components/welcome/home-page-content";

const HOME_TITLE = SITE_NAME;
const HOME_DESCRIPTION =
  "Learn quantum computing from first principles with Amazon Braket: a hands-on curriculum, a live circuit playground, real QPU access with transparent costs, and an AI tutor in the margin.";

export const metadata: Metadata = {
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  // Next.js REPLACES a page-level openGraph object (no deep-merge), so the
  // layout's siteName and structured image are spread back in from lib/site —
  // the most-shared URL on the site must not be the one route that drops
  // og:site_name and og:image:width/height/alt.
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
    type: "website",
    siteName: SITE_NAME,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

/**
 * Server shell: load curriculum numbers once at build time, then hand them to
 * the client HomePageContent so the language selector can re-render all copy.
 */
export default async function HomePage() {
  const sections = getSections();
  const summaries = (
    await Promise.all(sections.map((s) => getContentSummary(s.slug)))
  ).map((s) => s ?? "");
  const notebookTotal = sections.reduce((n, s) => n + s.notebookCount, 0);

  return (
    <HomePageContent
      sections={sections}
      summaries={summaries}
      notebookTotal={notebookTotal}
    />
  );
}
