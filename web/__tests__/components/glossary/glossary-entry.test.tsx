/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { GlossaryEntry } from "@/components/glossary/glossary-entry";
import type { GlossaryTerm } from "@/lib/glossary";

// TransitionLink -> plain anchor (no app router needed). InlineMarkdown -> plain
// passthrough so this test never imports the ESM react-markdown.
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

const bell: GlossaryTerm = {
  term: "Bell pair",
  definition: "Two maximally entangled qubits.",
  section: "01-foundations",
  seeAlso: ["Entanglement"],
};

describe("GlossaryEntry", () => {
  it("renders the term name", () => {
    render(<GlossaryEntry term={bell} />);
    expect(screen.getByRole("heading", { name: "Bell pair" })).toBeInTheDocument();
  });

  it("renders the definition text", () => {
    render(<GlossaryEntry term={bell} />);
    expect(screen.getByText("Two maximally entangled qubits.")).toBeInTheDocument();
  });

  it("shows a category chip linking to the section's lesson", () => {
    render(<GlossaryEntry term={bell} />);
    const chip = screen.getByRole("link", { name: /Foundations/ });
    expect(chip).toHaveAttribute("href", "/learn/01-foundations");
  });

  it("anchors the entry with a slug id for see-also targeting", () => {
    const { container } = render(<GlossaryEntry term={bell} />);
    expect(container.querySelector("#bell-pair")).not.toBeNull();
  });

  it("renders see-also links to related term anchors", () => {
    render(<GlossaryEntry term={bell} />);
    const seeAlso = screen.getByRole("link", { name: "Entanglement" });
    expect(seeAlso).toHaveAttribute("href", "#entanglement");
  });

  it("omits the see-also row when there are no references", () => {
    render(<GlossaryEntry term={{ term: "Qubit", definition: "x", section: "01-foundations" }} />);
    expect(screen.queryByText(/See also/i)).toBeNull();
  });
});
