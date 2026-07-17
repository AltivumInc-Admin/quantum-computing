/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/footer";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

describe("Footer", () => {
  it("links to the playground", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Playground" })).toHaveAttribute(
      "href",
      "/playground",
    );
  });

  it("links to the runbook", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Runbook" })).toHaveAttribute("href", "/runbook");
  });

  it("links to the credentials page", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Credentials" })).toHaveAttribute(
      "href",
      "/credentials",
    );
  });

  it("links to the glossary", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Glossary" })).toHaveAttribute("href", "/glossary");
  });

  it("links to the review dashboard", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/review");
  });

  it("links to the pricing page", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
  });

  it("links to the privacy page", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });

  it("lets the nav row wrap so eight links fit on narrow viewports", () => {
    render(<Footer />);
    const nav = screen.getByRole("navigation", { name: "Footer" });
    expect(nav).toHaveClass("flex-wrap");
  });

  it("links to the GitHub repo in a new tab, safely", () => {
    render(<Footer />);
    const gh = screen.getByRole("link", { name: "GitHub" });
    expect(gh).toHaveAttribute("href", "https://github.com/AltivumInc-Admin/quantum-computing");
    expect(gh).toHaveAttribute("target", "_blank");
    expect(gh).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
