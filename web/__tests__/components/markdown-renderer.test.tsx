/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "@/components/markdown-renderer";

// react-markdown v10 and the remark/rehype plugins are ESM-only; the repo's
// jest runs ts-jest in CommonJS mode (transformIgnorePatterns ignores
// node_modules), so they are mocked here to exercise the component's contract
// (wrapper + content passthrough) without an ESM import error. The REAL KaTeX
// math rendering is verified end-to-end against the static export in CI's
// build-smoke job (it asserts class="katex" in the emitted HTML), which tests
// the actual production render path.
jest.mock("react-markdown", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: string }) => {
      // Parse markdown content into React elements for testing
      const lines = children.split("\n");
      const elements: React.ReactNode[] = [];

      let i = 0;
      while (i < lines.length) {
        const line = lines[i];

        // Headings
        const h2Match = line.match(/^## (.+)$/);
        if (h2Match) {
          elements.push(React.createElement("h2", { key: i }, h2Match[1]));
          i++;
          continue;
        }

        // Code blocks
        const codeStart = line.match(/^```(\w*)$/);
        if (codeStart) {
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].match(/^```$/)) {
            codeLines.push(lines[i]);
            i++;
          }
          elements.push(
            React.createElement("pre", { key: i },
              React.createElement("code", null, codeLines.join("\n"))
            )
          );
          i++;
          continue;
        }

        // Links
        const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          elements.push(
            React.createElement("a", { key: i, href: linkMatch[2] }, linkMatch[1])
          );
          i++;
          continue;
        }

        // Plain text
        if (line.trim()) {
          elements.push(React.createElement("p", { key: i }, line));
        }
        i++;
      }

      return React.createElement("div", null, ...elements);
    },
  };
});

jest.mock("remark-gfm", () => () => {});
jest.mock("remark-math", () => () => {});
jest.mock("rehype-katex", () => () => {});
jest.mock("rehype-highlight", () => () => {});

describe("MarkdownRenderer", () => {
  it("renders markdown headings", () => {
    render(<MarkdownRenderer content="## Hello World" />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Hello World");
  });

  it("renders code blocks", () => {
    render(<MarkdownRenderer content={"```python\nprint('hi')\n```"} />);
    expect(screen.getByText("print('hi')")).toBeInTheDocument();
  });

  it("renders links", () => {
    render(<MarkdownRenderer content="[Click here](https://example.com)" />);
    const link = screen.getByRole("link", { name: "Click here" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("wraps content in a prose article", () => {
    const { container } = render(<MarkdownRenderer content="hello" />);
    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    expect(article).toHaveClass("prose");
  });

  it("passes math source through without throwing", () => {
    // The mocked pipeline does not transform $...$ (real KaTeX is asserted in
    // the build-smoke job); this guards the component against regressions in
    // how it forwards content when math is present.
    render(<MarkdownRenderer content={"State $|\\psi\\rangle = \\alpha\\ket{0}$ here."} />);
    expect(screen.getByText(/State/)).toBeInTheDocument();
  });
});
