/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * The ONE auth-gated budget read for /workspace, and the surface that decides which
 * DIAGNOSIS every budget-dependent panel on that page gets to state. It used to map
 * every thrown failure except NotSignedIn to "error", so the edge's 429
 * (lambda/qpu/edge.yaml) — a live service saying "wait a minute" — arrived downstream
 * as an outage. One throttle then produced two contradictory readings on a single page,
 * because qpu-submit-panel.tsx DOES read the 429 and says so.
 *
 * The real `isRateLimited` + `QpuHttpError` are used, never stubs: a stubbed predicate
 * would let this file stay green while the classification itself rotted (the same
 * reasoning qpu-submit-panel.test.tsx records for its own mock).
 */
jest.mock("@/lib/qpu-client", () => {
  const actual = jest.requireActual("@/lib/qpu-client") as typeof import("@/lib/qpu-client");
  return {
    __esModule: true,
    isQpuConfigured: jest.fn(() => true),
    getBudget: jest.fn(),
    isRateLimited: actual.isRateLimited,
    QpuHttpError: actual.QpuHttpError,
  };
});

let mockAuthStatus = "authenticated";
jest.mock("@/components/auth/auth-provider", () => ({
  __esModule: true,
  useAuth: () => ({ status: mockAuthStatus, email: null, signOut: async () => {} }),
}));

import {
  WorkspaceBudgetProvider,
  useWorkspaceBudget,
} from "@/components/workspace/budget-provider";
import * as qpu from "@/lib/qpu-client";

const m = qpu as jest.Mocked<typeof qpu>;

/** Prints the context verbatim — the status IS the contract this file guards. */
function Probe() {
  const { status, budget } = useWorkspaceBudget();
  return (
    <p data-testid="probe">
      {status}:{budget === null ? "null" : String(budget.remainingMicros)}
    </p>
  );
}

const draw = () =>
  render(
    <WorkspaceBudgetProvider>
      <Probe />
    </WorkspaceBudgetProvider>,
  );

const probe = () => screen.getByTestId("probe");

const budget = (over: Record<string, unknown> = {}) => ({
  capMicros: 2_500_000,
  spentMicros: 0,
  remainingMicros: 2_500_000,
  credentialed: true,
  completedRuns: 0,
  completedShots: 0,
  tasks: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthStatus = "authenticated";
  (m.isQpuConfigured as jest.Mock).mockReturnValue(true);
});

describe("WorkspaceBudgetProvider", () => {
  it("stays unconfigured — and never fetches — while the QPU surface is off", () => {
    (m.isQpuConfigured as jest.Mock).mockReturnValue(false);
    draw();
    expect(probe()).toHaveTextContent("unconfigured:null");
    expect(m.getBudget).not.toHaveBeenCalled();
  });

  it("waits out the Amplify-bridge race: no fetch until auth is authenticated", async () => {
    mockAuthStatus = "configuring";
    const { unmount } = draw();
    expect(probe()).toHaveTextContent("loading:null");
    expect(m.getBudget).not.toHaveBeenCalled();
    unmount();

    mockAuthStatus = "authenticated";
    m.getBudget.mockResolvedValue(budget());
    draw();
    await waitFor(() => expect(probe()).toHaveTextContent("ready:2500000"));
  });

  it("reports a signed-out mid-flight session as signed-out, not an error", async () => {
    m.getBudget.mockRejectedValue(Object.assign(new Error("not signed in"), { name: "NotSignedIn" }));
    draw();
    await waitFor(() => expect(probe()).toHaveTextContent("signed-out:null"));
  });

  /**
   * THE FIX. A 429 is a live service under a rate limit; "error" is an outage claim.
   * The submit panel on the SAME page already says "a rate limit, not an outage", so
   * collapsing it here is what made one condition read as two different things.
   */
  it("reports a rate-limited read as THROTTLED, never as an error", async () => {
    m.getBudget.mockRejectedValue(new qpu.QpuHttpError("budget", 429));
    draw();
    await waitFor(() => expect(probe()).toHaveTextContent("throttled:null"));
    expect(probe()).not.toHaveTextContent("error");
  });

  it("still reports a real outage as an error — 500 and 403 are NOT throttles", async () => {
    // 403 deliberately stays an error on this path: qpu-core.mjs answers an edge-secret
    // mismatch with 403, so a misconfigured origin must keep reading as a fault rather
    // than telling the learner to wait out a misconfiguration (qpu-client.ts:45-60).
    for (const status of [500, 502, 403]) {
      m.getBudget.mockRejectedValue(new qpu.QpuHttpError("budget", status));
      const { unmount } = draw();
      await waitFor(() => expect(probe()).toHaveTextContent("error:null"));
      expect(probe()).not.toHaveTextContent("throttled");
      unmount();
    }
  });

  it("reports a malformed budget (a thrown plain Error) as an error", async () => {
    m.getBudget.mockRejectedValue(new Error("budget malformed"));
    draw();
    await waitFor(() => expect(probe()).toHaveTextContent("error:null"));
  });
});
