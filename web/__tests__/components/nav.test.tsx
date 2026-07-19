/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Nav } from "@/components/nav";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

jest.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => {
    const React = require("react");
    return React.createElement("button", { "aria-label": "Toggle theme" }, "theme-toggle");
  },
}));

jest.mock("@/components/auth/account-menu", () => ({
  AccountMenu: () => {
    const React = require("react");
    return React.createElement("div", { "data-testid": "account-menu" }, "account-menu");
  },
}));

describe("Nav", () => {
  it("should render a header element", () => {
    render(<Nav />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("should render a navigation element", () => {
    render(<Nav />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("should render a link to the home page with the Quantum Learner brand", () => {
    render(<Nav />);
    const link = screen.getByRole("link", { name: "Quantum Learner" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("should link every pill destination from BOTH rows (md+ pill and small-screen row)", () => {
    render(<Nav />);
    const destinations: [string, string][] = [
      ["Playground", "/playground"],
      ["Runbook", "/runbook"],
      ["Credentials", "/credentials"],
      ["Pricing", "/pricing"],
    ];
    for (const [name, href] of destinations) {
      const links = screen.getAllByRole("link", { name });
      // Each destination renders twice: once in the md+ centered pill, once
      // in the small-screen row — only one is displayed at any width.
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(link).toHaveAttribute("href", href);
        expect(link).toHaveClass("focus-ring");
      }
    }
  });

  it("shows exactly one pill row on each side of the md breakpoint", () => {
    render(<Nav />);
    // The centered pill is hidden below md; the second row exists only below md.
    const desktopPill = document.querySelector(".md\\:flex");
    const mobileRow = document.querySelector(".md\\:hidden");
    expect(desktopPill).toHaveClass("hidden");
    expect(mobileRow).not.toBeNull();
    expect(desktopPill!.querySelectorAll("a")).toHaveLength(4);
    expect(mobileRow!.querySelectorAll("a")).toHaveLength(4);
  });

  it("should render the ThemeToggle component", () => {
    render(<Nav />);
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("should render the AccountMenu", () => {
    render(<Nav />);
    expect(screen.getByTestId("account-menu")).toBeInTheDocument();
  });
});
