/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { SeeAlsoLinks } from "@/components/glossary/see-also-links";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

describe("SeeAlsoLinks", () => {
  it("renders nothing when there are no refs", () => {
    const { container } = render(<SeeAlsoLinks refs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("links each ref to its term page", () => {
    render(<SeeAlsoLinks refs={["Bell pair", "Entanglement"]} />);
    expect(screen.getByRole("link", { name: "Bell pair" })).toHaveAttribute("href", "/glossary/bell-pair");
    expect(screen.getByRole("link", { name: "Entanglement" })).toHaveAttribute("href", "/glossary/entanglement");
  });
});
