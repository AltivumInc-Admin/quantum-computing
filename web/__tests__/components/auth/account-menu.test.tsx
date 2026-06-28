/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

const signOut = jest.fn();
let mockAuth = {
  status: "unauthenticated" as
    | "unconfigured"
    | "configuring"
    | "authenticated"
    | "unauthenticated",
  email: null as string | null,
  signOut,
};
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

import { AccountMenu } from "@/components/auth/account-menu";

describe("AccountMenu", () => {
  beforeEach(() => {
    signOut.mockReset();
    mockAuth = { status: "unauthenticated", email: null, signOut };
  });

  it("renders nothing when unconfigured", () => {
    mockAuth.status = "unconfigured";
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a Sign in link when unauthenticated", () => {
    render(<AccountMenu />);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("renders the email and a menu with Workspace + Sign out when authenticated", () => {
    mockAuth = { status: "authenticated", email: "a@b.com", signOut };
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: /a@b\.com/i });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole("link", { name: /workspace/i })).toHaveAttribute(
      "href",
      "/workspace"
    );
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("calls signOut from the menu", () => {
    mockAuth = { status: "authenticated", email: "a@b.com", signOut };
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("closes the menu on Escape", () => {
    mockAuth = { status: "authenticated", email: "a@b.com", signOut };
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
  });
});
