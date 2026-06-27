import {
  GLOSSARY,
  SECTION_SHORT_LABEL,
  sectionShortLabel,
  sortedTerms,
  groupByLetter,
  matchesQuery,
  termSlug,
  ALPHABET,
  type GlossaryTerm,
} from "@/lib/glossary";
import { getSections, getSectionBySlug } from "@/lib/sections";

describe("glossary data integrity", () => {
  it("has unique term names (case-insensitive)", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const t of GLOSSARY) {
      const key = t.term.toLowerCase();
      if (seen.has(key)) dupes.push(t.term);
      seen.set(key, t.term);
    }
    expect(dupes).toEqual([]);
  });

  it("tags every term with a real curriculum section slug", () => {
    const valid = new Set(getSections().map((s) => s.slug));
    const bad = GLOSSARY.filter((t) => !valid.has(t.section)).map((t) => t.term);
    expect(bad).toEqual([]);
  });

  it("resolves every seeAlso reference to an existing term", () => {
    const terms = new Set(GLOSSARY.map((t) => t.term));
    const broken: string[] = [];
    for (const t of GLOSSARY) {
      for (const ref of t.seeAlso ?? []) {
        if (!terms.has(ref)) broken.push(`${t.term} -> ${ref}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("produces a unique anchor slug per term (no collisions)", () => {
    const slugs = GLOSSARY.map((t) => termSlug(t.term));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("maps a short label for exactly the 7 curriculum slugs", () => {
    const labelSlugs = Object.keys(SECTION_SHORT_LABEL).sort();
    const manifestSlugs = getSections().map((s) => s.slug).sort();
    expect(labelSlugs).toEqual(manifestSlugs);
    for (const s of getSections()) {
      expect(sectionShortLabel(s.slug as never)).toBe(SECTION_SHORT_LABEL[s.slug as never]);
      expect(getSectionBySlug(s.slug)).toBeDefined(); // label slug is a real section
    }
  });

  it("contains a comprehensive inventory (>= 60 terms)", () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(60);
  });
});

describe("glossary helpers", () => {
  const sample: GlossaryTerm[] = [
    { term: "Qubit", definition: "x", section: "01-foundations" },
    { term: "amplitude", definition: "y", section: "00-prereqs" },
    { term: "Ansatz", definition: "z", section: "04-quantum-ml" },
  ];

  it("sorts terms A-Z, case-insensitively", () => {
    expect(sortedTerms(sample).map((t) => t.term)).toEqual(["amplitude", "Ansatz", "Qubit"]);
  });

  it("groups sorted terms under their uppercase first letter", () => {
    const groups = groupByLetter(sample);
    expect(groups.map((g) => g.letter)).toEqual(["A", "Q"]);
    expect(groups[0].terms.map((t) => t.term)).toEqual(["amplitude", "Ansatz"]);
  });

  it("matches a query against term, alias, and definition (case/diacritic-insensitive)", () => {
    const t: GlossaryTerm = {
      term: "CNOT gate", definition: "entangling gate", section: "01-foundations", aliases: ["CX"],
    };
    expect(matchesQuery(t, "")).toBe(true);          // empty matches all
    expect(matchesQuery(t, "cnot")).toBe(true);       // term, case-insensitive
    expect(matchesQuery(t, "cx")).toBe(true);         // alias
    expect(matchesQuery(t, "entangl")).toBe(true);    // definition substring
    expect(matchesQuery(t, "grover")).toBe(false);    // no match
  });

  it("exposes the 26-letter alphabet", () => {
    expect(ALPHABET).toHaveLength(26);
    expect(ALPHABET[0]).toBe("A");
    expect(ALPHABET[25]).toBe("Z");
  });
});
