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
  it("nav carries a desktop Playground link beside Runbook (in the pill, hidden below md)", () => {
    render(<Nav />);
    const link = screen.getByRole("link", { name: "Playground" });
    expect(link).toHaveAttribute("href", "/playground");
    // It lives inside the centered glass pill, which is hidden below md; the
    // footer carries the all-viewport (mobile) Playground path.
    const pill = link.closest("div");
    expect(pill?.className).toContain("hidden");
    expect(pill?.className).toContain("md:flex");
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
