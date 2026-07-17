import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { SITE_URL } from "@/lib/site";
import { getSections } from "@/lib/sections";
import { GLOSSARY, termSlug } from "@/lib/glossary";

describe("sitemap", () => {
  it("includes top routes, every lesson, and every term, all absolute", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}`);
    expect(urls).toContain(`${SITE_URL}/playground`);
    expect(urls).toContain(`${SITE_URL}/glossary`);
    expect(urls).toContain(`${SITE_URL}/review`);
    expect(urls).toContain(`${SITE_URL}/runbook`);
    expect(urls).toContain(`${SITE_URL}/credentials`);
    expect(urls).toContain(`${SITE_URL}/pricing`);
    expect(urls).toContain(`${SITE_URL}/privacy`);
    for (const s of getSections()) expect(urls).toContain(`${SITE_URL}/learn/${s.slug}`);
    expect(urls).toContain(`${SITE_URL}/glossary/${termSlug(GLOSSARY[0].term)}`);
    expect(urls).toHaveLength(8 + getSections().length + GLOSSARY.length);
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
  });
});

describe("robots", () => {
  it("allows all crawlers (no disallow — noindex needs crawlability) and points to the sitemap", () => {
    const r = robots();
    // /e2e-fixtures/ pages are excluded via rendered noindex meta + sitemap
    // absence. A robots.txt Disallow would CANCEL the noindex (crawlers never
    // fetch the page, never see the meta, and can still index the bare URL),
    // so this pin also guards against someone "helpfully" re-adding one.
    expect(r.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("keeps the e2e fixtures out of the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.includes("e2e-fixtures"))).toBe(false);
  });
});
