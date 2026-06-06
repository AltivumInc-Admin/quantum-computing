import { extractHeadings, buildLineSlugMap } from "@/lib/extract-headings";

describe("extractHeadings", () => {
  it("collects h2 and h3 headings with level, text, slug and 1-based line", () => {
    const md = ["# Title", "", "## Superposition", "", "### Detail"].join("\n");
    expect(extractHeadings(md)).toEqual([
      { level: 2, text: "Superposition", slug: "superposition", line: 3 },
      { level: 3, text: "Detail", slug: "detail", line: 5 },
    ]);
  });

  it("ignores the h1 title and any h4+ headings", () => {
    const md = ["# Title", "## Keep", "#### Drop"].join("\n");
    const headings = extractHeadings(md);
    expect(headings.map((h) => h.text)).toEqual(["Keep"]);
  });

  it("does not treat '##' inside a fenced code block as a heading", () => {
    const md = [
      "## Real Heading",
      "```python",
      "## this is a comment, not a heading",
      "x = 1",
      "```",
      "## Second Heading",
    ].join("\n");
    expect(extractHeadings(md).map((h) => h.text)).toEqual([
      "Real Heading",
      "Second Heading",
    ]);
  });

  it("disambiguates repeated headings in document order", () => {
    const md = ["## Notes", "## Notes", "## Notes"].join("\n");
    expect(extractHeadings(md).map((h) => h.slug)).toEqual([
      "notes",
      "notes-1",
      "notes-2",
    ]);
  });

  it("strips inline emphasis and code markers from text and slug", () => {
    const md = "## The **H** `gate`";
    expect(extractHeadings(md)[0]).toMatchObject({
      text: "The H gate",
      slug: "the-h-gate",
    });
  });

  it("renders a markdown link in a heading as its label", () => {
    const md = "## See [the docs](https://example.com)";
    expect(extractHeadings(md)[0]).toMatchObject({
      text: "See the docs",
      slug: "see-the-docs",
    });
  });

  it("returns an empty list when there are no subheadings", () => {
    expect(extractHeadings("# Only a title\n\nProse only.")).toEqual([]);
  });

  it("ignores '##' lines inside an HTML comment block", () => {
    const md = [
      "## Real",
      "<!--",
      "## hidden in a comment",
      "-->",
      "## Also Real",
    ].join("\n");
    expect(extractHeadings(md).map((h) => h.text)).toEqual(["Real", "Also Real"]);
  });

  it("does not let a commented-out heading drift real-heading slugs", () => {
    const md = ["<!-- ## Notes -->", "## Notes", "## Notes"].join("\n");
    expect(extractHeadings(md).map((h) => h.slug)).toEqual(["notes", "notes-1"]);
  });
});

describe("buildLineSlugMap", () => {
  it("maps each heading's source line to its slug", () => {
    const md = ["# Title", "## Alpha", "## Alpha"].join("\n");
    const map = buildLineSlugMap(md);
    expect(map.get(2)).toBe("alpha");
    expect(map.get(3)).toBe("alpha-1");
    expect(map.has(1)).toBe(false);
  });
});
