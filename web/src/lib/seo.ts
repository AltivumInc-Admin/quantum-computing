import type { Metadata } from "next";
import { SITE_NAME, OG_IMAGE } from "./site";

// Shared per-page SEO helpers. Relative URLs here resolve against
// metadataBase (SITE_URL) set in the root layout.

// Cut a description at a word boundary so meta/OG text never ends mid-word.
export function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

// The full metadata shape for a content page: canonical URL + Open Graph
// article + Twitter summary card. Used by the glossary term pages and the
// lesson pages so both emit the same, complete set of tags.
export function articleMetadata(opts: {
  /** Full document title (with the site suffix). */
  title: string;
  /** Bare title for social cards. */
  ogTitle: string;
  description: string;
  /** Site-relative canonical path, e.g. "/learn/01-foundations". */
  path: string;
}): Metadata {
  const { title, ogTitle, description, path } = opts;
  return {
    title,
    description,
    alternates: { canonical: path },
    // Next.js REPLACES a page-level openGraph object (no deep merge with the
    // root layout's), so the site name and branded card image must be spread
    // back in here or every article page silently drops them (see lib/site.ts).
    openGraph: {
      title: ogTitle,
      description,
      url: path,
      type: "article",
      siteName: SITE_NAME,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary", title: ogTitle, description },
  };
}
