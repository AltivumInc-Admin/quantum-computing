import type { Components } from "react-markdown";
import type { Element, ElementContent } from "hast";
import { WidgetFence } from "./quantum/widget-fence";
import { WIDGET_LANGS } from "./quantum/widget-langs";
import { CodeBlock } from "./code-block";
import { MarkdownTable } from "./markdown-table";

/**
 * The hast-to-React override map for the lesson renderer, and the two pure hast
 * helpers it needs.
 *
 * Deliberately SEPARATE from markdown-renderer.tsx, which owns the other job:
 * configuring the react-markdown/remark/rehype pipeline and importing the
 * route-scoped KaTeX stylesheet. Nothing here touches any of that. Keeping the
 * two together forced every test that wanted the pure map to first neutralize
 * the whole ESM-only pipeline (react-markdown v10 and four plugins, against a
 * ts-jest CommonJS runtime) — an identical five-line jest.mock preamble
 * copy-pasted into three suites, which broke all three whenever a plugin was
 * added or swapped. `import type { Components }` is erased at compile time, so
 * this module pulls in no ESM at runtime.
 *
 * Route scoping is unaffected: markdown-renderer.tsx remains the module the
 * /learn route pulls in, and katex.min.css is still imported from there.
 */

// react-markdown hands its overrides real hast nodes (`node?: Element`), and
// @types/hast is one of its own hard dependencies — so these walk the typed
// tree directly. A future node-shape change fails at compile time instead of
// silently returning undefined ids or empty raw text.
export function hastText(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(hastText).join("");
  return ""; // comments and anything else contribute no rendered text
}

// Only the start line is needed, to anchor heading ids back to their source
// line via the precomputed slug map.
export function headingId(
  node: Element | undefined,
  lineSlugs: Map<number, string>
): string | undefined {
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
