/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";

// A controllable stand-in for sync-client's health store: the real transition
// logic (failure counting, auth classification, reset-on-success) is covered in
// lib/sync-client.test.ts; this file proves the masthead RENDERS it correctly.
type SyncHealth = "ok" | "degraded" | "auth";
let health: SyncHealth = "ok";
const listeners = new Set<() => void>();
const setHealth = (next: SyncHealth) => {
  health = next;
  listeners.forEach((l) => l());
};

jest.mock("@/lib/sync-client", () => ({
  isSyncConfigured: () => true,
  lastSyncedAt: () => null,
  syncNow: jest.fn(async () => ({ applied: 0, pushed: false })),
  getSyncHealth: () => health,
  subscribeSyncHealth: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
}));

import { Masthead } from "@/components/workspace/masthead";

/** Let the readout's dynamic import of the sync client settle. */
const mount = async () => {
  render(<Masthead email="ai-dev@altivum.ai" />);
  await act(async () => {});
};

describe("Masthead sync-health indicator", () => {
  beforeEach(() => {
    health = "ok";
    listeners.clear();
  });

  it("renders NOTHING extra when healthy — the ordinary readout only", async () => {
    await mount();
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Not yet synced");
    expect(screen.queryByText(/sync paused/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
  });

  it("degraded sync updates the text of the PERSISTENT live region", async () => {
    await mount();
    const region = screen.getByRole("status"); // mounted before the failure exists

    act(() => setHealth("degraded"));

    // The SAME element carries the new text — role=status was never remounted
    // alongside its content, so the announcement is reliable.
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Sync paused — retrying");
  });

  it("an auth failure names the fix — sign in — in the same live region", async () => {
    await mount();
    const region = screen.getByRole("status");

    act(() => setHealth("auth"));

    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Session expired — sign in to resume sync");
  });

  it("recovery returns the readout to its ordinary state", async () => {
    await mount();
    act(() => setHealth("degraded"));
    act(() => setHealth("ok"));
    expect(screen.getByRole("status")).toHaveTextContent("Not yet synced");
    expect(screen.queryByText(/sync paused/i)).not.toBeInTheDocument();
  });
});
