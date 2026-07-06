import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getSections } from "@/lib/sections";
import { GLOSSARY, termSlug } from "@/lib/glossary";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const top = ["", "/glossary", "/review", "/runbook"].map((p) => ({ url: `${SITE_URL}${p}` }));
  const lessons = getSections().map((s) => ({ url: `${SITE_URL}/learn/${s.slug}` }));
  const terms = GLOSSARY.map((t) => ({ url: `${SITE_URL}/glossary/${termSlug(t.term)}` }));
  return [...top, ...lessons, ...terms];
}
