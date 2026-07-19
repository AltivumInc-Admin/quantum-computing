import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import type { Element, ElementContent } from "hast";
import { WidgetFence } from "./quantum/widget-fence";
import { WIDGET_LANGS } from "./quantum/widget-langs";
import { CodeBlock } from "./code-block";
import { MarkdownTable } from "./markdown-table";
import { buildLineSlugMap } from "@/lib/extract-headings";
import { KATEX_MACROS } from "@/lib/katex-macros";
// KaTeX styles ship only with the routes that render math (here and the
// glossary's InlineMarkdown), not in the global stylesheet every funnel page
// pays for. The `.katex-display` overflow rule stays in globals.css.
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

// react-markdown hands its overrides real hast nodes (`node?: Element`), and
// @types/hast is one of its own hard dependencies — so these walk the typed
// tree directly. A future node-shape change fails at compile time instead of
// silently returning undefined ids or empty raw text.
function hastText(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(hastText).join("");
  return ""; // comments and anything else contribute no rendered text
}

// Only the start line is needed, to anchor heading ids back to their source
// line via the precomputed slug map.
function headingId(node: Element | undefined, lineSlugs: Map<number, string>): string | undefined {
  const line = node?.position?.start.line;
  return line != null ? lineSlugs.get(line) : undefined;
}

/**
 * Build the react-markdown component overrides. Heading overrides stamp a stable
 * `id` on each h2/h3 (looked up by source line, so it stays deterministic and
 * matches the table of contents); custom ```q* fences route to an interactive
 * widget (resolved + code-split per-widget by WidgetFence); all other fences
 * become a CodeBlock with copy + wrap controls; GFM tables gain an overflow
 * container so a wide gate table scrolls in place instead of the whole page.
 */
export function makeComponents(lineSlugs: Map<number, string>): Components {
  return {
    h2({ node, children, ...rest }) {
      return (
        <h2 id={headingId(node, lineSlugs)} {...rest}>
          {children}
        </h2>
      );
    },
    h3({ node, children, ...rest }) {
      return (
        <h3 id={headingId(node, lineSlugs)} {...rest}>
          {children}
        </h3>
      );
    },
    // GFM tables (e.g. the gate table whose Matrix cells are KaTeX bmatrix
    // blocks) have an unshrinkable min-content width far past a phone
    // viewport; MarkdownTable scrolls them inside their own box (WCAG 1.4.10).
    table({ node, ...rest }) {
      void node; // destructured off so it can't leak onto the DOM <table>
      return <MarkdownTable {...rest} />;
    },
    // Overriding <pre> (not <code>) keeps the markup valid. The bare language
    // token (e.g. "qsim", "python") is read once from the `language-*` class.
    pre(props) {
      const { node, children } = props;
      const code = node?.children?.[0];
      const className =
        code && code.type === "element" ? code.properties?.className : undefined;
      const language = Array.isArray(className)
        ? className
            .map((c) => String(c))
            .find((c) => c.startsWith("language-"))
            ?.replace("language-", "")
        : undefined;
      const raw = code ? hastText(code) : "";
      // Custom ```q* fences route to a lazily-loaded interactive widget (chunked
      // per-widget so a page ships only the widgets it renders); every other fence
      // becomes a CodeBlock with the rehype-highlight token spans preserved.
      if (language && WIDGET_LANGS.has(language)) {
        return <WidgetFence language={language} source={raw} />;
      }
      return (
        <CodeBlock rawText={raw} language={language}>
          {children}
        </CodeBlock>
      );
    },
  };
}

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
          // throwOnError: false renders a malformed expression in red rather
          // than aborting the static build.
          [rehypeKatex, { macros: KATEX_MACROS, throwOnError: false }],
          // ignoreMissing: false would throw on the custom "qsim" language.
          [rehypeHighlight, { ignoreMissing: true }],
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
