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

  it("should render a link to the home page with text 'Quantum Workspace'", () => {
    render(<Nav />);
    const link = screen.getByRole("link", { name: "Quantum Workspace" });
    expect(link).toHaveAttribute("href", "/");
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
