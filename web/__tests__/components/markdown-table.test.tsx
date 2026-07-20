/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import React from "react";

// makeComponents and MarkdownTable are real code under test; both live apart
// from the ESM-only react-markdown/remark/rehype pipeline, so this suite needs
// no jest.mock preamble to load them under ts-jest's CJS.
import { MarkdownTable } from "@/components/markdown-table";
import { makeComponents } from "@/components/markdown-components";

function renderTable() {
  return render(
    <MarkdownTable>
      <tbody>
        <tr>
          <td>Gate</td>
        </tr>
      </tbody>
    </MarkdownTable>
  );
}

describe("MarkdownTable", () => {
  it("wraps the table in an overflow container without a tab stop when it fits", () => {
    const { container } = renderTable();
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain("overflow-x-auto");
    expect(wrapper.querySelector("table")).not.toBeNull();
    // jsdom reports scrollWidth === clientWidth === 0, so it does not overflow.
    expect(wrapper).not.toHaveAttribute("tabindex");
    expect(wrapper).not.toHaveAttribute("role");
    expect(wrapper).not.toHaveAttribute("aria-label");
  });

  it("becomes a labelled keyboard scroll region when the table overflows", () => {
    // The CodeBlock measure-then-expose idiom: fake an overflowing layout.
    const scrollSpy = jest
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(700);
    const clientSpy = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(343);
    try {
      const { container } = renderTable();
      const wrapper = container.firstElementChild!;
      expect(wrapper).toHaveAttribute("tabindex", "0");
      expect(wrapper).toHaveAttribute("role", "region");
      expect(wrapper).toHaveAttribute("aria-label", "Scrollable table");
      expect(wrapper.className).toContain("focus-ring");
    } finally {
      scrollSpy.mockRestore();
      clientSpy.mockRestore();
    }
  });
});

describe("makeComponents table routing", () => {
  it("routes GFM tables to MarkdownTable", () => {
    const components = makeComponents(new Map());
    const Table = components.table as (props: {
      node: unknown;
      children?: React.ReactNode;
    }) => React.ReactElement;
    const el = Table({ node: { type: "element" }, children: null });
    expect(el.type).toBe(MarkdownTable);
  });
});
