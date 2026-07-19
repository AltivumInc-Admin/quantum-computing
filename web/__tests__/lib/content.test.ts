import { getContent, getContentSummary } from "@/lib/content";

describe("content", () => {
  it("reads GUIDE.md for a valid section", async () => {
    const content = await getContent("01-foundations");
    expect(content).toBeDefined();
    expect(content!.markdown).toContain("# Quantum Computing Foundations");
    expect(content!.notebooks.length).toBeGreaterThan(0);
  });

  it("returns null for unknown section", async () => {
    const content = await getContent("99-unknown");
    expect(content).toBeNull();
  });

  it("gets summary (first paragraph) for a section", async () => {
    const summary = await getContentSummary("01-foundations");
    expect(summary).toBeDefined();
    expect(summary!.length).toBeGreaterThan(10);
    expect(summary!.length).toBeLessThan(500);
  });

  it("strips inline Markdown from card summaries", async () => {
    // 01-foundations and 00-prereqs intros contain **bold**, *italic*, and a
    // [link](url); none of those markers should leak onto the landing-page cards.
    for (const slug of ["00-prereqs", "01-foundations"]) {
      const summary = await getContentSummary(slug);
      expect(summary).toBeTruthy();
      expect(summary).not.toMatch(/\*\*/); // no bold markers
      expect(summary).not.toMatch(/\]\(/); // no link syntax
      expect(summary).not.toContain("`"); // no inline code ticks
    }
  });
});
