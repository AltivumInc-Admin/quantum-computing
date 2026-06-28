/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";

// Capture the props the provider passes to the (lazily-loaded) bridge so the test
// can drive state changes the way the real Amplify bridge would.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bridgeProps: any = null;
const bridgeRendered = jest.fn();
jest.mock("@/components/auth/amplify-auth-bridge", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => {
    bridgeRendered();
    bridgeProps = props;
    return null;
  },
}));

// next/dynamic hands back the (mocked) bridge component synchronously, and records
// the options it was called with so we can lock the ssr:false code-split contract —
// a regression to a plain eager `import` (which would leak Amplify back into every
// page's bundle) would fail the assertion below.
jest.mock("next/dynamic", () => {
  const state: { opts?: unknown } = {};
  return {
    __esModule: true,
    default: (_loader: unknown, opts: unknown) => {
      state.opts = opts;
      return require("@/components/auth/amplify-auth-bridge").default;
    },
    __state: state,
  };
});

let configured = true;
jest.mock("@/lib/auth-config", () => ({ isAuthConfigured: () => configured }));

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
    bridgeProps = null;
    bridgeRendered.mockClear();
  });

  it("stays unconfigured and never mounts the Amplify bridge when the gate is off", () => {
    configured = false;
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByTestId("status")).toHaveTextContent("unconfigured");
    expect(bridgeRendered).not.toHaveBeenCalled();
  });

  it("mounts the bridge and starts in 'configuring' when configured", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByTestId("status")).toHaveTextContent("configuring");
    expect(bridgeRendered).toHaveBeenCalled();
    expect(bridgeProps).not.toBeNull();
  });

  it("loads the Amplify bridge lazily via next/dynamic with ssr:false", () => {
    const { __state } = jest.requireMock("next/dynamic") as {
      __state: { opts?: unknown };
    };
    expect(__state.opts).toEqual({ ssr: false });
  });

  it("reflects the status + email the bridge reports", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    act(() => {
      bridgeProps.onStatus("authenticated");
      bridgeProps.onEmail("a@b.com");
    });
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("email")).toHaveTextContent("a@b.com");
  });

  it("delegates signOut to the function the bridge registers", async () => {
    const registered = jest.fn().mockResolvedValue(undefined);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    act(() => {
      bridgeProps.registerSignOut(registered);
    });
    await act(async () => {
      screen.getByText("out").click();
    });
    expect(registered).toHaveBeenCalledTimes(1);
  });
});
