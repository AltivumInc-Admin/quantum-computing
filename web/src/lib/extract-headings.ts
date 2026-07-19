import { Slugger } from "./slug";
import { stripLinksAndEmphasis } from "./strip-inline";

export interface Heading {
  level: 2 | 3;
  text: string;
  slug: string;
  /** 1-based source line of the heading in the markdown. */
  line: number;
}

// Turn the inline markdown inside a heading into the plain text it renders to,
// so the TOC label reads cleanly and its slug matches the rendered heading.
// The link/emphasis core is shared with content.ts's teaser stripper.
function stripInline(raw: string): string {
  return stripLinksAndEmphasis(raw)
    .replace(/[`*]/g, "") // leftover unpaired markers, stripped wholesale
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
  // The marker character (` or ~) that opened the current fence, or null when
  // outside one. CommonMark (and remark, which the renderer runs) closes a
  // fence only with the SAME marker: a ~~~ line inside an open ``` block is
  // fence CONTENT, not a toggle — a shared boolean would desync here and
  // silently break TOC anchors and heading ids.
  let fenceChar: string | null = null;
  let inComment = false;

  markdown.split("\n").forEach((rawLine, i) => {
    // HTML comment blocks take precedence over everything except code fences
    // we're already inside: a "## ..." line buried in <!-- ... --> is not a
    // heading, and would otherwise inject a phantom TOC entry and drift slugs.
    if (inComment) {
      if (rawLine.includes("-->")) inComment = false;
      return;
    }
    const fence = rawLine.match(FENCE);
    if (fence) {
      const marker = fence[1][0];
      if (fenceChar === null) fenceChar = marker;
      else if (fenceChar === marker) fenceChar = null;
      // else: mismatched marker inside an open fence — plain fence content.
      return;
    }
    if (fenceChar !== null) return;
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

/**
 * Pair already-extracted headings into the renderer's source-line → slug map.
 * The single home of the line→slug keying convention: the lesson page (which
 * holds its own extractHeadings result) and buildLineSlugMap both call this,
 * so the pairing can never drift between the two.
 */
export function lineSlugMapFrom(headings: Heading[]): Map<number, string> {
  return new Map(headings.map((h) => [h.line, h.slug]));
}

/** Source-line → slug map, used by the renderer to stamp heading ids by position. */
export function buildLineSlugMap(markdown: string): Map<number, string> {
  return lineSlugMapFrom(extractHeadings(markdown));
}
