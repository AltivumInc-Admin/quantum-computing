/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import GlossaryTermPage, { generateStaticParams, generateMetadata } from "@/app/glossary/[term]/page";
import { GLOSSARY } from "@/lib/glossary";

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

describe("glossary/[term] route", () => {
  it("emits one static param per glossary term", () => {
    const params = generateStaticParams();
    expect(params).toHaveLength(GLOSSARY.length);
    expect(params).toContainEqual({ term: "qubit" });
  });

  it("builds per-term SEO + OG metadata with math stripped", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ term: "qubit" }) });
    expect(String(md.title)).toMatch(/Qubit/);
    expect(md.alternates?.canonical).toBe("/glossary/qubit");
    expect(md.openGraph?.url).toBe("/glossary/qubit");
    expect(String(md.description)).not.toMatch(/\\ket|\$/);
  });

  it("renders the term detail for a valid slug", async () => {
    const ui = await GlossaryTermPage({ params: Promise.resolve({ term: "qubit" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1, name: "Qubit" })).toBeInTheDocument();
  });
});
