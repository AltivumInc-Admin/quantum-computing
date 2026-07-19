/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

jest.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
jest.mock("@/components/review-nav-badge", () => ({ ReviewNavBadge: () => null }));
jest.mock("@/components/auth/account-menu", () => ({ AccountMenu: () => null }));

describe("Playground discovery links", () => {
  it("nav carries Playground beside Runbook in BOTH pill rows (md+ pill and small-screen row)", () => {
    render(<Nav />);
    const links = screen.getAllByRole("link", { name: "Playground" });
    // One in the md+ centered pill, one in the small-screen row — every
    // viewport gets a header path to the playground (the footer is a
    // secondary path, no longer the only mobile one).
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/playground");
    }
    const pills = links.map((link) => link.closest("div")!.className);
    expect(pills.some((c) => c.includes("hidden") && c.includes("md:flex"))).toBe(true);
    expect(
      links.some((link) => link.closest("div.md\\:hidden, .md\\:hidden") !== null)
    ).toBe(true);
    // Same recipe as its Runbook sibling
    expect(screen.getAllByRole("link", { name: "Runbook" })).toHaveLength(2);
  });

  it("footer keeps its Playground link (secondary path)", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Playground" })).toHaveAttribute(
      "href",
      "/playground",
    );
  });
});
