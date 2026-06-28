/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

let hubCb: ((p: { payload: { event: string } }) => void) | null = null;
const hubUnsub = jest.fn();
jest.mock("aws-amplify/utils", () => ({
  Hub: {
    listen: (_c: string, cb: (p: { payload: { event: string } }) => void) => {
      hubCb = cb;
      return hubUnsub;
    },
  },
}));

let mockAuth = { status: "configuring" as string };
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

import CallbackPage from "@/app/auth/callback/page";

describe("CallbackPage", () => {
  beforeEach(() => {
    mockAuth = { status: "configuring" };
    replace.mockReset();
    hubCb = null;
  });

  it("shows a signing-in message while configuring", () => {
    render(<CallbackPage />);
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("routes to /workspace once authenticated", () => {
    mockAuth = { status: "authenticated" };
    render(<CallbackPage />);
    expect(replace).toHaveBeenCalledWith("/workspace");
  });

  it("routes home when unconfigured", () => {
    mockAuth = { status: "unconfigured" };
    render(<CallbackPage />);
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("routes to /login?error=google on a redirect failure event", () => {
    render(<CallbackPage />);
    hubCb!({ payload: { event: "signInWithRedirect_failure" } });
    expect(replace).toHaveBeenCalledWith("/login?error=google");
  });
});
