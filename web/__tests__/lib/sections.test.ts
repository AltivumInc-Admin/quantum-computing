import { getSections, getSectionBySlug } from "@/lib/sections";

describe("sections", () => {
  it("returns all 6 sections in order", () => {
    const sections = getSections();
    expect(sections).toHaveLength(6);
    expect(sections[0].slug).toBe("00-foundations");
    expect(sections[5].slug).toBe("05-hybrid-jobs");
  });

  it("returns a section by slug", () => {
    const section = getSectionBySlug("02-algorithms");
    expect(section).toBeDefined();
    expect(section!.title).toBe("Quantum Algorithms");
    expect(section!.index).toBe(2);
  });

  it("returns undefined for unknown slug", () => {
    expect(getSectionBySlug("99-unknown")).toBeUndefined();
  });
});
