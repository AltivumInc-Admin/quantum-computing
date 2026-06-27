"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { KATEX_MACROS } from "@/lib/katex-macros";

/**
 * Renders a glossary definition string as INLINE content: inline `code` and
 * $math$ (KaTeX) only. The single wrapping <p> react-markdown emits is unwrapped
 * to a fragment so the definition flows inside the entry's own <p>. Definitions
 * are authored as a single inline string (no block elements), so unwrapping <p>
 * is sufficient.
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
