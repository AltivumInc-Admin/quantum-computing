import { slugify, Slugger } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("trims and collapses surrounding/!inner whitespace", () => {
    expect(slugify("  Trim   Me  ")).toBe("trim-me");
  });

  it("drops punctuation and symbols", () => {
    expect(slugify("Special!@# Chars?")).toBe("special-chars");
  });

  it("strips inline emphasis and code markers to match rendered text", () => {
    expect(slugify("The **H** gate")).toBe("the-h-gate");
    expect(slugify("Using `Circuit`")).toBe("using-circuit");
  });

  it("preserves existing hyphens without doubling", () => {
    expect(slugify("Hybrid Quantum-Classical")).toBe("hybrid-quantum-classical");
  });

  it("returns an empty string for symbol-only input", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("Slugger", () => {
  it("returns the bare slug for a first occurrence", () => {
    const s = new Slugger();
    expect(s.slug("Superposition")).toBe("superposition");
  });

  it("disambiguates repeated headings with an incrementing suffix", () => {
    const s = new Slugger();
    expect(s.slug("Notes")).toBe("notes");
    expect(s.slug("Notes")).toBe("notes-1");
    expect(s.slug("Notes")).toBe("notes-2");
  });

  it("tracks each base independently", () => {
    const s = new Slugger();
    expect(s.slug("A")).toBe("a");
    expect(s.slug("B")).toBe("b");
    expect(s.slug("A")).toBe("a-1");
  });
});
