import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { WidgetFence } from "./quantum/widget-fence";
import { WIDGET_LANGS } from "./quantum/widget-langs";
import { CodeBlock } from "./code-block";
import { buildLineSlugMap } from "@/lib/extract-headings";

interface MarkdownRendererProps {
  content: string;
  /**
   * Source-line -> heading-slug map. The lesson page already computes this from
   * its own extractHeadings call; passing it in avoids a second full scan of the
   * GUIDE. Falls back to recomputing when a caller renders the renderer standalone.
   */
  lineSlugs?: Map<number, string>;
}

// Shared bra-ket macros so GUIDE authors write \ket{0} instead of the verbose
// \left|0\right\rangle. KaTeX renders these to HTML+CSS at build time, which
// is fully compatible with Next.js static export (output: "export").
const KATEX_MACROS = {
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle#1\\right|",
  "\\braket": "\\left\\langle#1\\middle|#2\\right\\rangle",
  "\\expval": "\\left\\langle#1\\right\\rangle",
};

// Minimal structural view of a hast node, enough to pull raw text out of a
// fenced code block without depending on @types/hast being present.
type HastTextNode = { type?: string; value?: string; children?: HastTextNode[] };

function hastText(node: HastTextNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

// Position type for a hast node (only the start line is needed, to anchor
// heading ids back to their source line via the precomputed slug map).
type Positioned = { position?: { start?: { line?: number } } };

function headingId(node: unknown, lineSlugs: Map<number, string>): string | undefined {
  const line = (node as Positioned)?.position?.start?.line;
  return line != null ? lineSlugs.get(line) : undefined;
}

/**
 * Build the react-markdown component overrides. Heading overrides stamp a stable
 * `id` on each h2/h3 (looked up by source line, so it stays deterministic and
 * matches the table of contents); custom ```q* fences route to an interactive
 * widget (resolved + code-split per-widget by WidgetFence); all other fences
 * become a CodeBlock with copy + wrap controls.
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
      const raw = code ? hastText(code as unknown as HastTextNode) : "";
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
