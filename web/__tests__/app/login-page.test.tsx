/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("@/components/auth/auth-form", () => ({
  AuthForm: () => {
    const React = require("react");
    return React.createElement("div", { "data-testid": "auth-form" }, "form");
  },
}));

let configured = true;
jest.mock("@/lib/auth-config", () => ({ isAuthConfigured: () => configured }));

let mockAuth = { status: "unauthenticated" as string };
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    configured = true;
    mockAuth = { status: "unauthenticated" };
    replace.mockReset();
  });

  it("shows a coming-soon panel when auth is unconfigured", () => {
    configured = false;
    render(<LoginPage />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByTestId("auth-form")).toBeNull();
  });

  it("renders the auth form when unauthenticated", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("auth-form")).toBeInTheDocument();
  });

  it("redirects to /workspace when already authenticated", () => {
    mockAuth = { status: "authenticated" };
    render(<LoginPage />);
    expect(replace).toHaveBeenCalledWith("/workspace");
  });
});
