import { Slugger } from "./slug";

export interface Heading {
  level: 2 | 3;
  text: string;
  slug: string;
  /** 1-based source line of the heading in the markdown. */
  line: number;
}

// Turn the inline markdown inside a heading into the plain text it renders to,
// so the TOC label reads cleanly and its slug matches the rendered heading.
function stripInline(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [label](url) / ![alt](url) → text
    .replace(/[`*]/g, "") // inline code + bold/italic markers
    .replace(/\s+#+\s*$/, "") // trailing ATX closing hashes (## Foo ##)
    .replace(/\s+/g, " ")
    .trim();
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^ {0,3}(#{2,3})\s+(.*\S)\s*$/;

/**
 * Extract the h2/h3 outline from a markdown string. The h1 title and h4+ are
 * skipped, fenced code blocks are ignored, and repeated headings are
 * disambiguated in document order (matching the ids the renderer assigns).
 */
export function extractHeadings(markdown: string): Heading[] {
  const slugger = new Slugger();
  const headings: Heading[] = [];
  let inFence = false;
  let inComment = false;

  markdown.split("\n").forEach((rawLine, i) => {
    // HTML comment blocks take precedence over everything except code fences
    // we're already inside: a "## ..." line buried in <!-- ... --> is not a
    // heading, and would otherwise inject a phantom TOC entry and drift slugs.
    if (inComment) {
      if (rawLine.includes("-->")) inComment = false;
      return;
    }
    if (FENCE.test(rawLine)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (rawLine.trim().startsWith("<!--")) {
      if (!rawLine.includes("-->")) inComment = true;
      return;
    }

    const match = rawLine.match(HEADING);
    if (!match) return;

    const text = stripInline(match[2]);
    if (!text) return;

    headings.push({
      level: match[1].length as 2 | 3,
      text,
      slug: slugger.slug(text),
      line: i + 1,
    });
  });

  return headings;
}

/** Source-line → slug map, used by the renderer to stamp heading ids by position. */
export function buildLineSlugMap(markdown: string): Map<number, string> {
  return new Map(extractHeadings(markdown).map((h) => [h.line, h.slug]));
}
