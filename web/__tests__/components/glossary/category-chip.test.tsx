/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { CategoryChip } from "@/components/glossary/category-chip";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

describe("CategoryChip", () => {
  it("links to the section lesson with its short label", () => {
    render(<CategoryChip section="02-hardware" />);
    const link = screen.getByRole("link", { name: "Hardware" });
    expect(link).toHaveAttribute("href", "/learn/02-hardware");
  });
});
