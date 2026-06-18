/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";

// markdown-renderer.tsx imports react-markdown + the remark/rehype plugins at
// module load (ESM-only); the repo's jest runs in CommonJS, so mock them to
// avoid an import error. We do NOT use ReactMarkdown here — we exercise the REAL
// fence-routing branch in makeComponents().pre() directly and assert the routing
// DECISION (which element each fence maps to), independent of the now-lazy widget
// chunks. The widgets' own UI is covered by their dedicated tests; the registry
// that maps a token to a component is covered in widget-fence.test.tsx.
jest.mock("react-markdown", () => ({ __esModule: true, default: () => null }));
jest.mock("remark-gfm", () => () => {});
jest.mock("remark-math", () => () => {});
jest.mock("rehype-katex", () => () => {});
jest.mock("rehype-highlight", () => () => {});

import { makeComponents } from "@/components/markdown-renderer";
import { WidgetFence } from "@/components/quantum/widget-fence";
import { CodeBlock } from "@/components/code-block";
import { WIDGET_LANGS } from "@/components/quantum/widget-langs";

type RoutedEl = React.ReactElement<{
  language?: string;
  source?: string;
  rawText?: string;
}>;

// Build the minimal hast node shape pre() inspects: node.children[0] is the
// <code> element carrying the language-* class and the fence body as text. We
// invoke pre() directly (no render) and inspect the React element it returns.
function routeFence(lang: string, body: string): RoutedEl {
  const components = makeComponents(new Map());
  const Pre = components.pre as (props: {
    node: unknown;
    children?: React.ReactNode;
  }) => RoutedEl;
  const node = {
    type: "element",
    children: [
      {
        type: "element",
        properties: { className: [`language-${lang}`] },
        children: [{ type: "text", value: body }],
      },
    ],
  };
  return Pre({ node, children: null });
}

describe("markdown fence routing", () => {
  it("routes every widget token to WidgetFence with the bare language + raw source", () => {
    for (const lang of WIDGET_LANGS) {
      const el = routeFence(lang, "FENCE-BODY");
      expect(el.type).toBe(WidgetFence);
      expect(el.props.language).toBe(lang);
      expect(el.props.source).toBe("FENCE-BODY");
    }
  });

  it("passes a JSON widget source through unchanged", () => {
    const json = JSON.stringify({ qubits: 3, marked: 5 });
    const el = routeFence("qgrover", json);
    expect(el.type).toBe(WidgetFence);
    expect(el.props.source).toBe(json);
  });

  it("routes an unknown language to a CodeBlock (not a widget)", () => {
    const el = routeFence("python", "print('hi')");
    expect(el.type).toBe(CodeBlock);
    expect(el.props.language).toBe("python");
    expect(el.props.rawText).toBe("print('hi')");
  });
});
