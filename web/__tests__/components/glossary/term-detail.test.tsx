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

const qubit = getTermBySlug("qubit")!;

// TermDetail no longer renders the definition — it takes both locales as
// already-rendered nodes, which is what keeps the KaTeX pipeline out of the
// client bundle (see the component's own note). Standing in for those nodes
// here with plain spans is also why this suite no longer needs the
// jest.mock of inline-markdown that used to neutralize its ESM imports.
function renderTerm() {
  return render(
    <TermDetail
      term={qubit}
      definitionEn={<span>server-rendered English definition</span>}
      definitionEs={<span>definicion en espanol</span>}
    />,
  );
}

describe("TermDetail", () => {
  it("renders the term as an h1", () => {
    renderTerm();
    expect(screen.getByRole("heading", { level: 1, name: "Qubit" })).toBeInTheDocument();
  });
  it("has a back link to the full glossary", () => {
    renderTerm();
    expect(screen.getByRole("link", { name: /all terms/i })).toHaveAttribute("href", "/glossary");
  });
  it("shows the category chip linking to the lesson", () => {
    renderTerm();
    expect(screen.getByRole("link", { name: "Foundations" })).toHaveAttribute("href", "/learn/01-foundations");
  });
  it("lists related terms in the same category, linking to their pages", () => {
    renderTerm();
    expect(screen.getByText(/more in foundations/i)).toBeInTheDocument();
    const bell = screen.getByRole("link", { name: "Bell pair" });
    expect(bell).toHaveAttribute("href", "/glossary/bell-pair");
  });
  it("renders the copy-link button and the coming-soon CTA", () => {
    renderTerm();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    // The CTA carries the one brand name from lib/site.ts (WS-A1 rebrand) and,
    // with Cognito env absent here, the unconfigured "coming soon" variant.
    expect(screen.getByText("Quantum Learner")).toBeInTheDocument();
    expect(screen.getByText(/sign-up coming soon/i)).toBeInTheDocument();
  });
  it("shows the prerendered definition for the active locale and not the other", () => {
    // No LocaleProvider here, so useLocale falls back to English — the same
    // locale the static export prerenders. The Spanish node must be inert, not
    // merely hidden: both trees ride in the payload and only one may mount.
    renderTerm();
    expect(screen.getByText("server-rendered English definition")).toBeInTheDocument();
    expect(screen.queryByText("definicion en espanol")).not.toBeInTheDocument();
  });
});
