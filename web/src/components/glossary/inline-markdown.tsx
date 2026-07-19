import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { KATEX_MACROS } from "@/lib/katex-macros";
// KaTeX styles ship route-scoped with the math consumers (here and the lesson
// MarkdownRenderer) instead of in globals.css, keeping the funnel pages lean.
import "katex/dist/katex.min.css";

/**
 * Renders a glossary definition string as INLINE content: inline `code` and
 * $math$ (KaTeX) only. The single wrapping <p> react-markdown emits is unwrapped
 * to a fragment so the definition flows inside the entry's own <p>. Definitions
 * are authored as a single inline string (no block elements), so unwrapping <p>
 * is sufficient.
 *
 * SERVER Component (the markdown-renderer.tsx pattern): definitions are fixed
 * strings, so the whole react-markdown + remark-math + rehype-katex pipeline
 * runs once at build and ships as prerendered markup — none of it lands in the
 * client bundle. Keep it out of "use client" modules or the pipeline is
 * dragged back onto every glossary page.
 */
export function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[[rehypeKatex, { macros: KATEX_MACROS, throwOnError: false }]]}
      components={{ p: ({ children }) => <>{children}</> }}
    >
      {children}
    </ReactMarkdown>
  );
}
