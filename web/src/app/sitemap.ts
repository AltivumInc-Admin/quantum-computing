import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only public routes belong here. The learning platform (curriculum,
  // glossary, playground, review, runbook, credentials, workspace) sits behind
  // the sign-up wall — see components/auth/auth-wall.tsx — and those routes
  // carry a noindex meta and redirect unauthenticated visitors to /login.
  // Advertising them would only send crawlers into that redirect.
  return ["", "/pricing", "/privacy"].map((p) => ({ url: `${SITE_URL}${p}` }));
}
