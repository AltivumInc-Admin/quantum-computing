import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { SITE_URL } from "@/lib/site";

describe("sitemap", () => {
  it("lists only the public routes, all absolute", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual([`${SITE_URL}`, `${SITE_URL}/pricing`, `${SITE_URL}/privacy`]);
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("excludes every route behind the sign-up wall", () => {
    const urls = sitemap().map((e) => e.url);
    for (const walled of [
      "/playground",
      "/glossary",
      "/review",
      "/runbook",
      "/credentials",
      "/workspace",
      "/learn/",
    ]) {
      expect(urls.some((u) => u.includes(walled))).toBe(false);
    }
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
