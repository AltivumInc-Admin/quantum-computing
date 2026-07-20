/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "@/components/markdown-renderer";

// react-markdown v10 and the remark/rehype plugins are ESM-only; the repo's
// jest runs ts-jest in CommonJS mode (transformIgnorePatterns ignores
// node_modules), so react-markdown is mocked as an inert children-passthrough
// stub — the house idiom (see the sibling fence-routing and headings suites,
// which exercise the REAL makeComponents dispatch directly). This file tests
// only the component's own contract: the prose <article> wrapper and content
// passthrough. It proves NOTHING about the real render path.
//
// The pipeline itself is verified end-to-end in CI's build-smoke job, in the
// "Assert the KaTeX + syntax-highlight render path ran" step (.github/
// workflows/ci.yml). It greps the emitted out/learn/01-foundations.html for
// `katex-html` (rehype-katex produced visual output), `katex-mathml` (the
// screen-reader tree is there too, not just the visual one), a rendered ket
// bracket (the shared KATEX_MACROS actually expanded), and `hljs` + `hljs-`
// (rehype-highlight visited the fences AND tokenized them) — then asserts the
// whole export ships zero `katex-error` spans, since rehype-katex 7 renders a
// malformed expression in red rather than failing the build. Bare class names,
// not `class="..."`: lesson pages sit behind the sign-up wall, so their content
// ships escaped inside the RSC payload.
//
// That step is the ONLY place any of this is observed. An earlier version of
// this comment cited a CI assertion that did not exist at all, so if you change
// the step, change this paragraph with it.
jest.mock("react-markdown", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: string }) => React.createElement("div", null, children),
  };
});
jest.mock("remark-gfm", () => () => {});
jest.mock("remark-math", () => () => {});
jest.mock("rehype-katex", () => () => {});
jest.mock("rehype-highlight", () => () => {});

describe("MarkdownRenderer", () => {
  it("wraps content in a prose article", () => {
    const { container } = render(<MarkdownRenderer content="hello" />);
    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    expect(article).toHaveClass("prose");
  });

  it("passes math source through without throwing", () => {
    // The stubbed pipeline does not transform $...$ (real KaTeX is asserted in
    // the build-smoke job); this guards the component against regressions in
    // how it forwards content when math is present.
    render(<MarkdownRenderer content={"State $|\\psi\\rangle = \\alpha\\ket{0}$ here."} />);
    expect(screen.getByText(/State/)).toBeInTheDocument();
  });
});
