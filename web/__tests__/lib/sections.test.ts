import { getSections, getSectionBySlug, hueFor, sectionHue } from "@/lib/sections";
import { getManifestSections } from "@/lib/manifest";

describe("sections", () => {
  it("derives every section from the content manifest (no hardcoded drift)", () => {
    const sections = getSections();
    const manifest = getManifestSections();
    expect(sections.map((s) => s.slug)).toEqual(manifest.map((m) => m.slug));
    for (const m of manifest) {
      const s = getSectionBySlug(m.slug)!;
      expect(s).toBeDefined();
      expect(s.title).toBe(m.title);
      expect(s.index).toBe(m.index);
      expect(s.dirName).toBe(m.dirName);
      expect(s.notebookCount).toBe(m.notebookCount);
    }
  });

  it("returns all 7 sections in order", () => {
    const sections = getSections();
    expect(sections).toHaveLength(7);
    expect(sections[0].slug).toBe("00-prereqs");
    expect(sections[6].slug).toBe("06-hybrid-jobs");
  });

  it("returns a section by slug", () => {
    const section = getSectionBySlug("03-algorithms");
    expect(section).toBeDefined();
    expect(section!.title).toBe("Quantum Algorithms");
    expect(section!.index).toBe(3);
  });

  it("returns undefined for unknown slug", () => {
    expect(getSectionBySlug("99-unknown")).toBeUndefined();
  });

  describe("hueFor", () => {
    it("maps each section index to its identity hue", () => {
      expect(hueFor(0)).toBe(192);
      expect(hueFor(3)).toBe(160);
      expect(hueFor(5)).toBe(230);
    });

    it("wraps the seventh section back to the first hue", () => {
      expect(sectionHue).toHaveLength(6);
      expect(hueFor(6)).toBe(hueFor(0));
    });
  });
});
