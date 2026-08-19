import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { allBadges, badgeSlug } from "@/lib/founding-ten";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only public routes belong here. The learning platform (curriculum,
  // glossary, playground, review, runbook, credentials, workspace) sits behind
  // the sign-up wall — see components/auth/auth-wall.tsx — and those routes
  // carry a noindex meta and redirect unauthenticated visitors to /login.
  // Advertising them would only send crawlers into that redirect.
  //
  // /founding-ten and its issued-badge proof pages are the exception: they
  // are deliberately public (see auth-wall.tsx's PUBLIC_PREFIXES) and
  // indexable — a credential nobody can find is not proof of anything. Badge
  // URLs are derived from the registry, never hardcoded, so an open slot
  // never gets a sitemap entry and a newly issued one is picked up for free.
  //
  // /changelog is public for the same reason: it is the freshness signal a
  // prospective learner checks, and it is registered in auth-wall.tsx's
  // PUBLIC_PATHS. These two lists must always move together — advertising a
  // walled route would only send crawlers into a redirect.
  const staticPaths = ["", "/pricing", "/privacy", "/founding-ten", "/changelog"];
  const badgePaths = allBadges().map((b) => `/founding-ten/${badgeSlug(b)}`);
  return [...staticPaths, ...badgePaths].map((p) => ({ url: `${SITE_URL}${p}` }));
}
