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
// passthrough. Real markdown + KaTeX rendering is verified end-to-end against
// the static export in CI's build-smoke job (it asserts class="katex" in the
// emitted HTML), which tests the actual production render path.
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
