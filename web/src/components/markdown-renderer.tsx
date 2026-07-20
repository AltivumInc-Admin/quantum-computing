import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { WIDGET_LANGS } from "./quantum/widget-langs";
import { makeComponents } from "./markdown-components";
import { buildLineSlugMap } from "@/lib/extract-headings";
import { KATEX_OPTIONS } from "@/lib/katex-macros";
// KaTeX styles ship only with the routes that render math (here and the
// glossary's InlineMarkdown), not in the global stylesheet every funnel page
// pays for. The `.katex-display` overflow rule stays in globals.css. The
// github-dark highlight theme is scoped the same way, from code-block.tsx.
import "katex/dist/katex.min.css";

interface MarkdownRendererProps {
  content: string;
  /**
   * Source-line -> heading-slug map. The lesson page already computes this from
   * its own extractHeadings call; passing it in avoids a second full scan of the
   * GUIDE. Falls back to recomputing when a caller renders the renderer standalone.
   */
  lineSlugs?: Map<number, string>;
}

// The ```q* fence tokens are routed to interactive widgets by makeComponents, so
// their source is never highlighted. Naming them here skips a lowlight
// throw/catch per widget fence — 141 of them across the seven GUIDEs, each one
// an exception raised and swallowed, with react-markdown discarding the
// resulting vfile message so nothing surfaced. (The `ignoreMissing` option this
// replaces does not exist in rehype-highlight 7 — the string appears nowhere in
// the package; unknown languages are handled by that internal catch.)
const HIGHLIGHT_OPTIONS = { plainText: [...WIDGET_LANGS] };

export function MarkdownRenderer({ content, lineSlugs: propLineSlugs }: MarkdownRendererProps) {
  // Computed once per render (Server Component): the renderer assigns heading ids
  // from the same slug source the table of contents reads, so anchors line up.
  const lineSlugs = propLineSlugs ?? buildLineSlugMap(content);
  const components = makeComponents(lineSlugs);

  return (
    <article className="prose prose-gray dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-accent hover:prose-a:text-accent-dark">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          // KATEX_OPTIONS is shared with the glossary's InlineMarkdown; it carries
          // the build-safety note (a malformed expression renders as a red
          // .katex-error span rather than aborting the export, and CI greps the
          // export to make sure one never ships).
          [rehypeKatex, KATEX_OPTIONS],
          [rehypeHighlight, HIGHLIGHT_OPTIONS],
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
