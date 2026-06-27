/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { GlossaryCard } from "@/components/glossary-card";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

describe("GlossaryCard", () => {
  it("links to the glossary page", () => {
    render(<GlossaryCard />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/glossary");
  });

  it("presents itself as a reference titled Glossary", () => {
    render(<GlossaryCard />);
    expect(screen.getByText("Glossary")).toBeInTheDocument();
    expect(screen.getByText(/reference/i)).toBeInTheDocument();
  });
});
