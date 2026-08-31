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

  it("should link every pill destination from BOTH rows (lg+ pill and small-screen row)", () => {
    render(<Nav />);
    const destinations: [string, string][] = [
      ["Playground", "/playground"],
      ["Runbook", "/runbook"],
      ["Credentials", "/credentials"],
      ["Pricing", "/pricing"],
    ];
    for (const [name, href] of destinations) {
      const links = screen.getAllByRole("link", { name });
      // Each destination renders twice: once in the lg+ centered pill, once
      // in the small-screen row — only one is displayed at any width.
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(link).toHaveAttribute("href", href);
        expect(link).toHaveClass("focus-ring");
      }
    }
  });

  it("shows exactly one pill row on each side of the lg breakpoint", () => {
    render(<Nav />);
    // The pill breakpoint is lg, not md: at md the centered pill appeared
    // ~100px before brand + pill + actions could fit, scrolling the page
    // sideways by 43px at exactly 768.
    const desktopPill = document.querySelector(".lg\\:flex");
    const mobileRow = document.querySelector(".lg\\:hidden");
    expect(desktopPill).toHaveClass("hidden");
    expect(mobileRow).not.toBeNull();
    expect(document.querySelector(".md\\:flex")).toBeNull();
    expect(document.querySelector(".md\\:hidden")).toBeNull();
    // Four destinations in the centered pill; the small-screen row carries the
    // same four plus Review, which moves out of the cramped top row below lg.
    expect(desktopPill!.querySelectorAll("a")).toHaveLength(4);
    expect(mobileRow!.querySelectorAll("a")).toHaveLength(5);
  });

  it("keeps Review reachable at every width, exactly once per row", () => {
    render(<Nav />);
    const reviewLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/review");
    // One in the lg+ action rail, one in the small-screen pill row.
    expect(reviewLinks).toHaveLength(2);
    expect(reviewLinks.some((el) => el.className.includes("lg:inline-flex"))).toBe(true);
    expect(reviewLinks.some((el) => el.className.includes("rounded-chip"))).toBe(true);
  });

  it("names the home link even where the wordmark is hidden below sm", () => {
    render(<Nav />);
    // The visible wordmark is display:none under sm, so the accessible name
    // must come from the link itself or phones get an unnamed home link.
    const link = screen.getByRole("link", { name: "Quantum Learner" });
    expect(link).toHaveAttribute("aria-label", "Quantum Learner");
  });

  it("does not use a shrink-proof 1fr track in the header grid", () => {
    render(<Nav />);
    // `1fr` is minmax(AUTO,1fr) and an auto minimum is min-content, so the
    // track refuses to compress and the page scrolls sideways instead.
    const row = document.querySelector("nav > div");
    expect(row!.className).toContain("minmax(0,1fr)");
    expect(row!.className).not.toMatch(/grid-cols-\[1fr_/);
  });

  it("keeps the action rail inside its grid track (signed-in overlap guard)", () => {
    render(<Nav />);
    // The signed-in cluster (Review + email + language + theme) can outgrow
    // its 1fr track. `justify-self-end` sizes the rail to fit-content, and an
    // end-justified fit-content box overflows LEFT over the centered pill
    // ("PricingReview"). The rail must stretch to the track (grid default)
    // and justify its flex line instead, so the email chip absorbs the squeeze.
    const rail = document.querySelector("nav > div > div:last-child")!;
    expect(rail.className).not.toContain("justify-self-end");
    expect(rail.className).toContain("justify-end");
    expect(rail.className).toContain("min-w-0");
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
