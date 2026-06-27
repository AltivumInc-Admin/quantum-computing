/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { InlineMarkdown } from "@/components/glossary/inline-markdown";

// react-markdown + plugins are ESM-only; the repo runs jest in CommonJS, so they
// are mocked. This minimal mock unwraps the single paragraph and turns `code`
// spans into <code>, which is all InlineMarkdown's contract needs to assert.
// Real KaTeX rendering is covered by the static-export build, not here.
jest.mock("react-markdown", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children, components }: { children: string; components?: Record<string, React.FC<{ children?: React.ReactNode }>> }) => {
      const parts = String(children).split(/(`[^`]+`)/g).filter(Boolean).map((seg, i) =>
        seg.startsWith("`") && seg.endsWith("`")
          ? React.createElement("code", { key: i }, seg.slice(1, -1))
          : seg
      );
      const P = components?.p ?? ((props: { children?: React.ReactNode }) => React.createElement("p", null, props.children));
      return React.createElement(P, null, parts);
    },
  };
});
jest.mock("remark-math", () => () => {});
jest.mock("rehype-katex", () => () => {});

describe("InlineMarkdown", () => {
  it("renders plain definition text", () => {
    render(<InlineMarkdown>A unit of quantum information.</InlineMarkdown>);
    expect(screen.getByText("A unit of quantum information.")).toBeInTheDocument();
  });

  it("renders inline code spans as <code>", () => {
    const { container } = render(<InlineMarkdown>{"satisfies `U† U = I`"}</InlineMarkdown>);
    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent("U† U = I");
  });

  it("does not wrap output in a block <p> (renders inline)", () => {
    const { container } = render(<InlineMarkdown>inline only</InlineMarkdown>);
    expect(container.querySelector("p")).toBeNull();
  });
});
