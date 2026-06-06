import { getContent, getContentSummary } from "@/lib/content";

describe("content", () => {
  it("reads GUIDE.md for a valid section", async () => {
    const content = await getContent("01-foundations");
    expect(content).toBeDefined();
    expect(content!.markdown).toContain("# Quantum Computing Foundations");
    expect(content!.title).toBe("Quantum Computing Foundations");
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
});
