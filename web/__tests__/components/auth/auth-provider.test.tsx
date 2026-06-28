/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";

const configure = jest.fn();
jest.mock("aws-amplify", () => ({ Amplify: { configure: (...a: unknown[]) => configure(...a) } }));

let hubCb: ((p: { payload: { event: string } }) => void) | null = null;
const hubUnsub = jest.fn();
jest.mock("aws-amplify/utils", () => ({
  Hub: {
    listen: (_channel: string, cb: (p: { payload: { event: string } }) => void) => {
      hubCb = cb;
      return hubUnsub;
    },
  },
}));

const getCurrentUser = jest.fn();
const fetchUserAttributes = jest.fn();
const amplifySignOut = jest.fn();
jest.mock("aws-amplify/auth", () => ({
  getCurrentUser: () => getCurrentUser(),
  fetchUserAttributes: () => fetchUserAttributes(),
  signOut: () => amplifySignOut(),
}));

let configured = true;
jest.mock("@/lib/auth-config", () => ({
  isAuthConfigured: () => configured,
  amplifyAuthConfig: () => ({ Auth: { Cognito: {} } }),
}));

import { AuthProvider, useAuth } from "@/components/auth/auth-provider";

function Probe() {
  const { status, email, signOut } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{email ?? ""}</span>
      <button onClick={() => void signOut()}>out</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    configured = true;
    hubCb = null;
    configure.mockClear();
    getCurrentUser.mockReset();
    fetchUserAttributes.mockReset();
    amplifySignOut.mockReset();
  });

  it("stays unconfigured and never configures Amplify when the gate is off", async () => {
    configured = false;
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    expect(screen.getByTestId("status")).toHaveTextContent("unconfigured");
    expect(configure).not.toHaveBeenCalled();
  });

  it("configures Amplify and resolves to authenticated with the user email", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchUserAttributes.mockResolvedValue({ email: "a@b.com" });
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    expect(configure).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("email")).toHaveTextContent("a@b.com");
  });

  it("resolves to unauthenticated when there is no current user", async () => {
    getCurrentUser.mockRejectedValue(new Error("no user"));
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
  });

  it("re-hydrates on a Hub signedIn event and clears on signedOut", async () => {
    getCurrentUser.mockRejectedValueOnce(new Error("no user")); // initial: unauthenticated
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");

    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchUserAttributes.mockResolvedValue({ email: "c@d.com" });
    await act(async () => {
      hubCb!({ payload: { event: "signedIn" } });
    });
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("email")).toHaveTextContent("c@d.com");

    await act(async () => {
      hubCb!({ payload: { event: "signedOut" } });
    });
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    expect(screen.getByTestId("email")).toHaveTextContent("");
  });

  it("signOut delegates to Amplify", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    fetchUserAttributes.mockResolvedValue({ email: "a@b.com" });
    amplifySignOut.mockResolvedValue(undefined);
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await act(async () => {
      screen.getByText("out").click();
    });
    expect(amplifySignOut).toHaveBeenCalledTimes(1);
  });
});
