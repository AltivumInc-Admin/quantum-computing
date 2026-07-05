import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    // Deliberately NO disallow for /e2e-fixtures/: those pages carry a
    // rendered noindex meta, which crawlers only honor if the URL stays
    // crawlable — a robots.txt Disallow would hide the noindex and permit
    // reference-only ("indexed, though blocked") listings. Noindex + absent
    // from the sitemap is the correct exclusion; a Disallow would cancel it.
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
