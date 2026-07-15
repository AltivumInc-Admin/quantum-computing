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
  it("nav carries a desktop Playground link beside Runbook (hidden below sm)", () => {
    render(<Nav />);
    const link = screen.getByRole("link", { name: "Playground" });
    expect(link).toHaveAttribute("href", "/playground");
    expect(link.className).toContain("hidden sm:inline-flex");
    // Same recipe as its Runbook sibling
    expect(screen.getByRole("link", { name: "Runbook" })).toBeInTheDocument();
  });

  it("footer carries the all-viewport Playground link (the mobile path)", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Playground" })).toHaveAttribute(
      "href",
      "/playground",
    );
  });
});
