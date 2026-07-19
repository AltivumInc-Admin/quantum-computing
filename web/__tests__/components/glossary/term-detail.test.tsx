/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TermDetail } from "@/components/glossary/term-detail";
import { getTermBySlug } from "@/lib/glossary";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});
jest.mock("@/components/glossary/inline-markdown", () => {
  const React = require("react");
  return { __esModule: true, InlineMarkdown: ({ children }: { children: string }) => React.createElement("span", null, children) };
});

const qubit = getTermBySlug("qubit")!;

describe("TermDetail", () => {
  it("renders the term as an h1", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByRole("heading", { level: 1, name: "Qubit" })).toBeInTheDocument();
  });
  it("has a back link to the full glossary", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByRole("link", { name: /all terms/i })).toHaveAttribute("href", "/glossary");
  });
  it("shows the category chip linking to the lesson", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByRole("link", { name: "Foundations" })).toHaveAttribute("href", "/learn/01-foundations");
  });
  it("lists related terms in the same category, linking to their pages", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByText(/more in foundations/i)).toBeInTheDocument();
    const bell = screen.getByRole("link", { name: "Bell pair" });
    expect(bell).toHaveAttribute("href", "/glossary/bell-pair");
  });
  it("renders the copy-link button and the coming-soon CTA", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    // The CTA carries the one brand name from lib/site.ts (WS-A1 rebrand) and,
    // with Cognito env absent here, the unconfigured "coming soon" variant.
    expect(screen.getByText("Quantum Learner")).toBeInTheDocument();
    expect(screen.getByText(/sign-up coming soon/i)).toBeInTheDocument();
  });
});
