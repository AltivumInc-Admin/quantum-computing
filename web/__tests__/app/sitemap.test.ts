import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { SITE_URL } from "@/lib/site";
import { getSections } from "@/lib/sections";
import { GLOSSARY, termSlug } from "@/lib/glossary";

describe("sitemap", () => {
  it("includes top routes, every lesson, and every term, all absolute", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}`);
    expect(urls).toContain(`${SITE_URL}/glossary`);
    expect(urls).toContain(`${SITE_URL}/review`);
    for (const s of getSections()) expect(urls).toContain(`${SITE_URL}/learn/${s.slug}`);
    expect(urls).toContain(`${SITE_URL}/glossary/${termSlug(GLOSSARY[0].term)}`);
    expect(urls).toHaveLength(3 + getSections().length + GLOSSARY.length);
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
  });
});

describe("robots", () => {
  it("allows all crawlers and points to the sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
