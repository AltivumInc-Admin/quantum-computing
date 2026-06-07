import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { CircuitLab } from "./quantum/circuit-lab";
import { WavefunctionScrubber } from "./quantum/wavefunction-scrubber";
import { Challenge } from "./quantum/challenge";
import { Quiz } from "./quantum/quiz";
import { RunnableEditor } from "./quantum/runnable-editor";
import { BlochBuilder } from "./quantum/bloch-builder-widget";
import { ShotsSampler } from "./quantum/shots-sampler";
import { CorrelationDemo } from "./quantum/correlation-demo";
import { CostCalculator } from "./quantum/cost-calculator";
import { DeviceTable } from "./quantum/device-table";
import { CodeBlock } from "./code-block";
import { buildLineSlugMap } from "@/lib/extract-headings";

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
 * matches the table of contents); custom fences route to interactive widgets;
 * all other fences become a CodeBlock with copy + wrap controls.
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
    // Render ```qsim fenced blocks as the interactive CircuitLab; everything
    // else falls through to the default <pre> (so rehype-highlight styling is
    // preserved). Overriding <pre> (not <code>) keeps the markup valid.
    pre(props) {
      const { node, children } = props;
      const code = node?.children?.[0];
      const className =
        code && code.type === "element" ? code.properties?.className : undefined;
      if (code && Array.isArray(className) && className.includes("language-qsim")) {
        return <CircuitLab source={hastText(code as unknown as HastTextNode)} />;
      }
      if (code && Array.isArray(className) && className.includes("language-qscrub")) {
        return <WavefunctionScrubber source={hastText(code as unknown as HastTextNode)} />;
      }
      if (code && Array.isArray(className) && className.includes("language-qchallenge")) {
        return <Challenge source={hastText(code as unknown as HastTextNode)} />;
      }
      if (code && Array.isArray(className) && className.includes("language-quiz")) {
        return <Quiz source={hastText(code as unknown as HastTextNode)} />;
      }
      if (code && Array.isArray(className) && className.includes("language-runnable")) {
        return <RunnableEditor source={hastText(code as unknown as HastTextNode)} />;
      }
      if (code && Array.isArray(className) && className.includes("language-qbloch")) {
        return <BlochBuilder />;
      }
      if (code && Array.isArray(className) && className.includes("language-qshots")) {
        return <ShotsSampler source={hastText(code as unknown as HastTextNode)} />;
      }
      if (code && Array.isArray(className) && className.includes("language-qcorr")) {
        return <CorrelationDemo source={hastText(code as unknown as HastTextNode)} />;
      }
      if (code && Array.isArray(className) && className.includes("language-qcost")) {
        return <CostCalculator source={hastText(code as unknown as HastTextNode)} />;
      }
      if (code && Array.isArray(className) && className.includes("language-qdevices")) {
        return <DeviceTable />;
      }
      // Every other fence becomes a CodeBlock: the highlighted <code> children are
      // preserved (syntax colors intact) and a copy button + language chip + wrap
      // toggle are added. The language is read from the `language-*` class.
      const language = Array.isArray(className)
        ? className
            .map((c) => String(c))
            .find((c) => c.startsWith("language-"))
            ?.replace("language-", "")
        : undefined;
      return (
        <CodeBlock rawText={hastText(code as unknown as HastTextNode)} language={language}>
          {children}
        </CodeBlock>
      );
    },
  };
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Computed once per render (Server Component): the renderer assigns heading ids
  // from the same slug source the table of contents reads, so anchors line up.
  const lineSlugs = buildLineSlugMap(content);
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
