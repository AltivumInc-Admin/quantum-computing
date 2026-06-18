import {
  stripGuideForTutor,
  extractSectionHeadings,
  buildSystemPrompt,
  SECTION_CHAR_CAP,
  type TutorSection,
} from "@/lib/tutor";

const SAMPLE = `# Foundations

A qubit is a unit vector. The amplitude is $\\alpha$ and the probability is $|\\alpha|^2$.

## Gates as rotations

Every gate is a **rotation** of the Bloch sphere. See \`RY(theta)\`.

\`\`\`qbloch
\`\`\`

\`\`\`python
print("hello")
\`\`\`

Read more at [the docs](https://example.com/x).
`;

describe("stripGuideForTutor", () => {
  it("removes widget and code fences entirely", () => {
    const out = stripGuideForTutor(SAMPLE);
    expect(out).not.toContain("qbloch");
    expect(out).not.toContain('print("hello")');
    expect(out).not.toContain("```");
  });

  it("unwraps inline code, math, links, and Markdown marks", () => {
    const out = stripGuideForTutor(SAMPLE);
    expect(out).toContain("RY(theta)"); // inline code unwrapped
    expect(out).toContain("|\\alpha|^2"); // inline math contents kept
    expect(out).toContain("the docs"); // link label kept
    expect(out).not.toContain("**"); // emphasis stripped
    expect(out).not.toContain("](http"); // link syntax gone
  });

  it("caps the output length", () => {
    const long = "word ".repeat(10_000);
    expect(stripGuideForTutor(long, 500).length).toBeLessThanOrEqual(500);
    expect(stripGuideForTutor(long).length).toBeLessThanOrEqual(SECTION_CHAR_CAP);
  });

  it("truncates over-cap text on a paragraph boundary rather than mid-sentence", () => {
    const p1 = "First paragraph. " + "x".repeat(400);
    const p2 = "Second paragraph that should be dropped whole.";
    const md = `${p1}\n\n${p2}`;
    // The cap lands a few chars into p2, so a naive slice would cut mid-paragraph.
    const out = stripGuideForTutor(md, p1.length + 5);
    expect(out).toBe(p1); // cut exactly at the paragraph boundary, p2 dropped whole
  });
});

describe("extractSectionHeadings", () => {
  it("returns H2/H3 headings in order, without the # marks", () => {
    expect(extractSectionHeadings(SAMPLE)).toEqual(["Gates as rotations"]);
  });
});

describe("buildSystemPrompt", () => {
  const section: TutorSection = {
    title: "Foundations",
    headings: ["Gates as rotations"],
    text: "A qubit is a unit vector.",
  };

  it("embeds the lesson title and text", () => {
    const p = buildSystemPrompt(section);
    expect(p).toContain('"Foundations"');
    expect(p).toContain("A qubit is a unit vector.");
    expect(p).toContain("Gates as rotations");
  });

  it("contains the guardrail clauses that make grounding trustworthy", () => {
    const p = buildSystemPrompt(section).toLowerCase();
    expect(p).toContain("answer only using the lesson text");
    expect(p).toContain("never invent");
    expect(p).toMatch(/socratic|guiding question/);
    expect(p).toContain("do not use emojis");
  });
});
