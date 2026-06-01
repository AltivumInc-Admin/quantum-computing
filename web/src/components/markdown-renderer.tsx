import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { CircuitLab } from "./quantum/circuit-lab";
import { Quiz } from "./quantum/quiz";

interface MarkdownRendererProps {
  content: string;
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

const components: Components = {
  // Render ```qsim fenced blocks as the interactive CircuitLab; everything
  // else falls through to the default <pre> (so rehype-highlight styling is
  // preserved). Overriding <pre> (not <code>) keeps the markup valid.
  pre(props) {
    const { node, children, ...rest } = props;
    const code = node?.children?.[0];
    const className =
      code && code.type === "element" ? code.properties?.className : undefined;
    if (code && Array.isArray(className) && className.includes("language-qsim")) {
      return <CircuitLab source={hastText(code as unknown as HastTextNode)} />;
    }
    if (code && Array.isArray(className) && className.includes("language-quiz")) {
      return <Quiz source={hastText(code as unknown as HastTextNode)} />;
    }
    return <pre {...rest}>{children}</pre>;
  },
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
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
