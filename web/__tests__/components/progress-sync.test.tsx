/**
 * @jest-environment jsdom
 */
import { render } from "@testing-library/react";

let mockAuth = { status: "authenticated" as string, email: "a@b.com" as string | null, signOut: jest.fn() };
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

const syncNow = jest.fn(async (): Promise<{ applied: number; pushed: boolean }> => ({ applied: 0, pushed: true }));
const exitFlush = jest.fn((): boolean => true);
const isSyncConfigured = jest.fn((): boolean => true);
jest.mock("@/lib/sync-client", () => ({ syncNow, exitFlush, isSyncConfigured }));

import { ProgressSync } from "@/components/progress-sync";

const DEBOUNCE_MS = 20_000;
const MAX_WAIT_MS = 60_000;

/** Settle the dynamic import + syncNow promise chains (fake timers leave microtasks real). */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

const progressEvent = () => window.dispatchEvent(new Event("qc-progress"));

/** jsdom's visibilityState is a non-configurable-looking getter; shadow it per test. */
function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

async function mount() {
  const utils = render(<ProgressSync />);
  await drainMicrotasks(); // initial sync + client warm-up
  return utils;
}

describe("ProgressSync", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAuth = { status: "authenticated", email: "a@b.com", signOut: jest.fn() };
    process.env.NEXT_PUBLIC_SYNC_URL = "https://sync.example";
    syncNow.mockClear().mockResolvedValue({ applied: 0, pushed: true });
    exitFlush.mockClear().mockReturnValue(true);
    isSyncConfigured.mockClear().mockReturnValue(true);
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.NEXT_PUBLIC_SYNC_URL;
    // Remove the per-test visibilityState shadow so jsdom's own getter returns.
    delete (document as unknown as Record<string, unknown>).visibilityState;
  });

  it("syncs once on arrival when authenticated", async () => {
    await mount();
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it("does nothing when unauthenticated or unconfigured", async () => {
    mockAuth = { ...mockAuth, status: "unauthenticated" };
    const { unmount } = await mount();
    unmount();

    mockAuth = { ...mockAuth, status: "authenticated" };
    delete process.env.NEXT_PUBLIC_SYNC_URL;
    await mount();

    expect(syncNow).not.toHaveBeenCalled();
  });

  it("coalesces a burst of qc-progress events into one debounced sync", async () => {
    await mount();
    for (let i = 0; i < 5; i++) {
      progressEvent();
      jest.advanceTimersByTime(5_000); // each event lands inside the previous window
    }
    expect(syncNow).toHaveBeenCalledTimes(1); // nothing yet — every event reset the timer

    jest.advanceTimersByTime(DEBOUNCE_MS - 5_000 - 1);
    expect(syncNow).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await drainMicrotasks();
    expect(syncNow).toHaveBeenCalledTimes(2); // 5 events -> exactly 1 push
  });

  it("maxWait: sustained grading cannot starve the sync past 60s", async () => {
    await mount();
    // A grade every 10s resets the 20s trailing timer forever.
    for (let t = 0; t < MAX_WAIT_MS - 10_000; t += 10_000) {
      progressEvent();
      jest.advanceTimersByTime(10_000);
      expect(syncNow).toHaveBeenCalledTimes(1);
    }
    progressEvent();
    jest.advanceTimersByTime(10_000); // reaches 60s after the FIRST event
    await drainMicrotasks();
    expect(syncNow).toHaveBeenCalledTimes(2);

    // Both timers were cleared by the flush: quiet from here on means no extra sync.
    jest.advanceTimersByTime(MAX_WAIT_MS * 2);
    await drainMicrotasks();
    expect(syncNow).toHaveBeenCalledTimes(2);
  });

  it("pagehide flushes pending progress and stands the timers down", async () => {
    await mount();
    progressEvent();
    window.dispatchEvent(new Event("pagehide"));
    expect(exitFlush).toHaveBeenCalledTimes(1);

    // The debounce/maxWait timers were cleared — nothing double-syncs later.
    jest.advanceTimersByTime(MAX_WAIT_MS * 2);
    await drainMicrotasks();
    expect(syncNow).toHaveBeenCalledTimes(1); // the initial sync only
  });

  it("visibilitychange to hidden flushes pending progress", async () => {
    await mount();
    progressEvent();
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(exitFlush).toHaveBeenCalledTimes(1);
  });

  it("visibilitychange to visible does not flush", async () => {
    await mount();
    progressEvent();
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(exitFlush).not.toHaveBeenCalled();
  });

  it("does not flush when nothing is pending", async () => {
    await mount();
    window.dispatchEvent(new Event("pagehide"));
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(exitFlush).not.toHaveBeenCalled();
  });

  it("keeps the debounce armed when exitFlush declines (tab switch that comes back)", async () => {
    exitFlush.mockReturnValue(false); // e.g. no cached auth header yet
    await mount();
    progressEvent();
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(exitFlush).toHaveBeenCalledTimes(1);

    // The page survived — the normal debounced sync still delivers the grades.
    jest.advanceTimersByTime(DEBOUNCE_MS);
    await drainMicrotasks();
    expect(syncNow).toHaveBeenCalledTimes(2);
  });

  it("flushes each pending burst at most once (hidden then pagehide)", async () => {
    await mount();
    progressEvent();
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    expect(exitFlush).toHaveBeenCalledTimes(1); // the second exit signal found nothing pending
  });

  it("cleanup: unmount cancels timers, listeners, and exit flushing", async () => {
    const { unmount } = await mount();
    progressEvent();
    unmount();

    jest.advanceTimersByTime(MAX_WAIT_MS * 2);
    await drainMicrotasks();
    expect(syncNow).toHaveBeenCalledTimes(1); // the initial sync only

    progressEvent();
    window.dispatchEvent(new Event("pagehide"));
    expect(exitFlush).not.toHaveBeenCalled();
  });

  it("swallows SyncAccountMismatch silently but warns on other failures", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const mismatch = new Error("mismatch");
      mismatch.name = "SyncAccountMismatch";
      syncNow.mockRejectedValueOnce(mismatch);
      const { unmount } = await mount();
      expect(warn).not.toHaveBeenCalled();
      unmount();

      syncNow.mockRejectedValueOnce(new Error("network down"));
      await mount();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
