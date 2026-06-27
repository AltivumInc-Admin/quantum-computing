/**
 * @jest-environment jsdom
 */
// web/__tests__/app/glossary-page.test.tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import GlossaryPage, { metadata } from "@/app/glossary/page";

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
  return {
    __esModule: true,
    InlineMarkdown: ({ children }: { children: string }) => React.createElement("span", null, children),
  };
});

describe("GlossaryPage", () => {
  it("exports SEO metadata mentioning the glossary", () => {
    expect(String(metadata.title)).toMatch(/glossary/i);
    expect(String(metadata.description)).toMatch(/term/i);
  });

  it("renders a page heading and the searchable glossary", () => {
    render(<GlossaryPage />);
    expect(screen.getByRole("heading", { level: 1, name: /glossary/i })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });
});
