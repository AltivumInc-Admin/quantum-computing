/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

let configured = false;
jest.mock("@/lib/auth-config", () => ({ isAuthConfigured: () => configured }));

import { WorkspaceCta } from "@/components/glossary/workspace-cta";

describe("WorkspaceCta", () => {
  beforeEach(() => {
    configured = false;
  });

  it("shows a coming-soon teaser when auth is unconfigured", () => {
    render(<WorkspaceCta />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up/i })).toBeNull();
  });

  it("links to /login?mode=signup when auth is configured", () => {
    configured = true;
    render(<WorkspaceCta />);
    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute(
      "href",
      "/login?mode=signup"
    );
  });
});
