/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";

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
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it("reports a TIMEOUT, not a Google failure, when nothing resolves in time", () => {
    // The distinction is the point: a timeout is evidence we stopped waiting,
    // never evidence the provider refused. Claiming the latter is what made a
    // successful-but-slow sign-in look broken.
    jest.useFakeTimers();
    render(<CallbackPage />);
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    expect(replace).toHaveBeenCalledWith("/login?error=timeout");
    expect(replace).not.toHaveBeenCalledWith("/login?error=google");
  });

  it("returns the visitor to the destination stashed before the Google hop", () => {
    sessionStorage.setItem("qc:oauth:next", "/learn/03-algorithms");
    mockAuth = { status: "authenticated" };
    render(<CallbackPage />);
    expect(replace).toHaveBeenCalledWith("/learn/03-algorithms");
    // consumed, so a later plain sign-in does not inherit it
    expect(sessionStorage.getItem("qc:oauth:next")).toBeNull();
  });

  it("ignores an off-origin destination (no open redirect)", () => {
    sessionStorage.setItem("qc:oauth:next", "//evil.example.com/x");
    mockAuth = { status: "authenticated" };
    render(<CallbackPage />);
    expect(replace).toHaveBeenCalledWith("/workspace");
  });

  it("clears the timeout once authenticated (no stray redirect to login)", () => {
    jest.useFakeTimers();
    const { rerender } = render(<CallbackPage />);
    mockAuth = { status: "authenticated" };
    rerender(<CallbackPage />);
    expect(replace).toHaveBeenCalledWith("/workspace");
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    expect(replace).not.toHaveBeenCalledWith("/login?error=google");
    expect(replace).not.toHaveBeenCalledWith("/login?error=timeout");
  });
});
