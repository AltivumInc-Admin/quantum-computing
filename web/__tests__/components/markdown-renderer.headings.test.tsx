/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
// makeComponents lives in markdown-components.tsx, apart from the pipeline
// configuration, so this suite needs no jest.mock preamble for the ESM-only
// react-markdown/remark/rehype chain: it imports none of it.
import { makeComponents } from "@/components/markdown-components";

function node(line: number) {
  return { position: { start: { line } } };
}

describe("makeComponents heading ids", () => {
  it("stamps the slug for a heading's source line onto its id", () => {
    const components = makeComponents(new Map([[3, "superposition"]]));
    const H2 = components.h2 as React.ElementType;
    render(<H2 node={node(3)}>Superposition</H2>);
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute(
      "id",
      "superposition"
    );
  });

  it("stamps ids on h3 headings too", () => {
    const components = makeComponents(new Map([[7, "detail"]]));
    const H3 = components.h3 as React.ElementType;
    render(<H3 node={node(7)}>Detail</H3>);
    expect(screen.getByRole("heading", { level: 3 })).toHaveAttribute(
      "id",
      "detail"
    );
  });

  it("leaves the id unset for a line with no known slug", () => {
    const components = makeComponents(new Map([[3, "superposition"]]));
    const H2 = components.h2 as React.ElementType;
    render(<H2 node={node(99)}>Orphan</H2>);
    expect(screen.getByRole("heading", { level: 2 })).not.toHaveAttribute("id");
  });
});
