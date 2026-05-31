import { getSections, getSectionBySlug } from "@/lib/sections";

describe("sections", () => {
  it("returns all 7 sections in order", () => {
    const sections = getSections();
    expect(sections).toHaveLength(7);
    expect(sections[0].slug).toBe("00-prereqs");
    expect(sections[6].slug).toBe("05-hybrid-jobs");
  });

  it("returns a section by slug", () => {
    const section = getSectionBySlug("02-algorithms");
    expect(section).toBeDefined();
    expect(section!.title).toBe("Quantum Algorithms");
    expect(section!.index).toBe(3);
  });

  it("returns undefined for unknown slug", () => {
    expect(getSectionBySlug("99-unknown")).toBeUndefined();
  });
});
