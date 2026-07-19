// web/__tests__/app/learn-section-page.test.tsx
//
// Metadata contract for the lesson pages: every /learn/{slug} page must emit
// the full SEO shape (canonical + Open Graph + Twitter card) with a real
// per-section description — not the old broken template that lowercased the
// section title and doubled "Amazon Braket".
// react-markdown v10 is ESM-only and the repo's jest runs ts-jest in CommonJS
// mode, so the renderer (imported by the page module, unused by these
// metadata tests) is mocked to avoid the ESM import error.
jest.mock("@/components/markdown-renderer", () => ({
  __esModule: true,
  MarkdownRenderer: () => null,
}));

import { generateMetadata, generateStaticParams } from "@/app/learn/[section]/page";
import { getSections } from "@/lib/sections";

describe("learn/[section] route metadata", () => {
  it("emits one static param per curriculum section", () => {
    const params = generateStaticParams();
    expect(params).toHaveLength(getSections().length);
    expect(params).toContainEqual({ section: "02-hardware" });
  });

  it("builds full canonical + OG + Twitter metadata for a lesson", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ section: "02-hardware" }) });
    expect(String(md.title)).toBe("Quantum Hardware on Amazon Braket — Quantum Learner");
    expect(md.alternates?.canonical).toBe("/learn/02-hardware");

    const og = md.openGraph as Record<string, unknown>;
    expect(og.title).toBe("Quantum Hardware on Amazon Braket");
    expect(og.url).toBe("/learn/02-hardware");
    expect(og.type).toBe("article");
    // Next.js REPLACES the layout's openGraph on override, so articleMetadata
    // must spread the site name and branded card image back in itself.
    expect(og.siteName).toBe("Quantum Learner");
    expect(og.images).toEqual([expect.objectContaining({ url: "/og.jpg" })]);

    const twitter = md.twitter as Record<string, unknown>;
    expect(twitter.card).toBe("summary");
    expect(twitter.title).toBe("Quantum Hardware on Amazon Braket");
  });

  it("describes the lesson with its own prose, never the doubled-Braket template", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ section: "02-hardware" }) });
    const description = String(md.description);
    // The old template produced "Learn quantum hardware on amazon braket with
    // Amazon Braket" — a lowercased proper noun plus a doubled product name.
    expect(description).not.toMatch(/braket with amazon braket/i);
    expect(description).not.toMatch(/^Learn quantum hardware/);
    expect(description).not.toMatch(/amazon braket/); // never lowercased
    expect(description.length).toBeGreaterThan(20);
    expect(description.length).toBeLessThanOrEqual(156);
    // OG/Twitter carry the same description.
    expect((md.openGraph as Record<string, unknown>).description).toBe(description);
    expect((md.twitter as Record<string, unknown>).description).toBe(description);
  });

  it("keeps a truncation-safe description for every section", async () => {
    for (const section of getSections()) {
      const md = await generateMetadata({ params: Promise.resolve({ section: section.slug }) });
      const description = String(md.description);
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(156);
      expect(md.alternates?.canonical).toBe(`/learn/${section.slug}`);
      // The per-page noindex is the ONLY thing keeping these walled lesson
      // URLs out of search indexes: robots.txt deliberately allows crawling
      // (a Disallow would cancel the noindex — see sitemap.test.ts), so a
      // regression here would silently re-expose every gate page.
      expect(md.robots).toEqual({ index: false, follow: false });
    }
  });

  it("returns Not Found metadata for an unknown slug", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ section: "99-nope" }) });
    expect(md).toEqual({ title: "Not Found" });
  });
});
