/**
 * @jest-environment jsdom
 */
import { TextEncoder } from "node:util";

// jsdom does not expose the encoding global exitFlush uses at runtime.
const g = globalThis as Record<string, unknown>;
g.TextEncoder ??= TextEncoder;

import {
  syncNow,
  exitFlush,
  resetLastGoodSync,
  lastSyncedAt,
  isSyncConfigured,
  SyncAccountMismatchError,
  SYNC_META_KEY,
  KEEPALIVE_BODY_LIMIT,
  getSyncHealth,
  subscribeSyncHealth,
  resetSyncHealth,
  DEGRADED_AFTER,
} from "@/lib/sync-client";
import { fetchAuthSession } from "aws-amplify/auth";

jest.mock("aws-amplify/auth", () => ({
  fetchAuthSession: jest.fn(async () => ({
    tokens: { idToken: { toString: () => "JWT", payload: { sub: "user-1" } } },
  })),
}));
jest.mock("@/lib/auth-config", () => ({ isAuthConfigured: () => true }));

const card = (lastEpochDay: number) =>
  JSON.stringify({ reps: 1, lapses: 0, stability: 1, difficulty: 5, dueEpochDay: lastEpochDay + 1, lastEpochDay });

function mockFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    if (!r) throw new Error("unexpected fetch");
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe("syncNow", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLastGoodSync();
    process.env.NEXT_PUBLIC_SYNC_URL = "https://sync.example";
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SYNC_URL;
  });

  it("is gated on the env var", () => {
    delete process.env.NEXT_PUBLIC_SYNC_URL;
    expect(isSyncConfigured()).toBe(false);
  });

  it("pull-merges remote knowledge, pushes local knowledge, records the sync", async () => {
    localStorage.setItem("qc:section:local", "1");
    const calls = mockFetch([
      { status: 200, body: { version: 2, data: { "qc:section:remote": "1" } } },
      { status: 200, body: { version: 3 } },
    ]);

    const result = await syncNow();

    expect(result.applied).toBe(1); // gained the remote section flag
    expect(result.pushed).toBe(true);
    expect(localStorage.getItem("qc:section:remote")).toBe("1");
    // Authorization on both requests; PUT names the version it read.
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer JWT");
    const putBody = JSON.parse(String(calls[1].init?.body));
    expect(putBody.baseVersion).toBe(2);
    expect(putBody.data).toEqual({ "qc:section:local": "1", "qc:section:remote": "1" });
    expect(lastSyncedAt()).not.toBeNull();
  });

  it("skips the push when the merge adds nothing beyond the server copy", async () => {
    localStorage.setItem("qc:section:a", "1");
    mockFetch([{ status: 200, body: { version: 5, data: { "qc:section:a": "1" } } }]);
    const result = await syncNow();
    expect(result.pushed).toBe(false);
  });

  it("retries once through a 409: re-pulls, re-merges with the other device, re-pushes", async () => {
    localStorage.setItem("qc:card:x", card(20590));
    localStorage.setItem("qc:section:mine", "1"); // local knowledge the server lacks either round
    const calls = mockFetch([
      { status: 200, body: { version: 1, data: {} } },
      { status: 409 }, // another device pushed between our pull and push
      { status: 200, body: { version: 2, data: { "qc:card:x": card(20594) } } },
      { status: 200, body: { version: 3 } },
    ]);

    const result = await syncNow();

    expect(result.pushed).toBe(true);
    // The other device's more recent review won the merge locally too.
    expect(localStorage.getItem("qc:card:x")).toBe(card(20594));
    expect(JSON.parse(String(calls[3].init?.body)).baseVersion).toBe(2);
  });

  it("binds the device to the account on first sync", async () => {
    mockFetch([{ status: 200, body: { version: 0, data: {} } }]);
    await syncNow();
    expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).sub).toBe("user-1");
  });

  it("refuses to merge under a DIFFERENT account without an explicit choice", async () => {
    // The cross-account bleed repro: sibling A synced this device; B signs in.
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastSyncedAt: 1, sub: "user-OTHER" }));
    localStorage.setItem("qc:section:a", "1");
    const calls = mockFetch([]);
    await expect(syncNow()).rejects.toThrow(SyncAccountMismatchError);
    expect(calls).toHaveLength(0); // nothing left the device
  });

  it("binds at ATTEMPT, not success — a fully-failed sync still fences the next account", async () => {
    mockFetch([{ status: 500 }]);
    await expect(syncNow()).rejects.toThrow(/pull failed/);
    expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).sub).toBe("user-1");
  });

  it("a FAILED adopt still rebinds immediately — no deferred bleed into the old account", async () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastSyncedAt: 1, sub: "user-OTHER" }));
    localStorage.setItem("qc:section:mine", "1");
    mockFetch([
      { status: 200, body: { version: 1, data: {} } },
      { status: 409 },
      { status: 200, body: { version: 2, data: {} } },
      { status: 409 },
    ]);
    await expect(syncNow({ accountChange: "adopt" })).rejects.toThrow(/conflict/);
    // Bound to the NEW account despite the failure: the next auto-sync can no
    // longer push this device's freshly-merged data into the OLD account.
    expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).sub).toBe("user-1");
  });

  it("accountChange 'adopt' merges the device's progress into the new account and rebinds", async () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastSyncedAt: 1, sub: "user-OTHER" }));
    localStorage.setItem("qc:section:mine", "1");
    const calls = mockFetch([
      { status: 200, body: { version: 0, data: {} } },
      { status: 200, body: { version: 1 } },
    ]);
    await syncNow({ accountChange: "adopt" });
    expect(JSON.parse(String(calls[1].init?.body)).data).toEqual({ "qc:section:mine": "1" });
    expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).sub).toBe("user-1");
  });

  it("accountChange 'reset' wipes local qc:* and takes the account's data only", async () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastSyncedAt: 1, sub: "user-OTHER" }));
    localStorage.setItem("qc:section:theirs", "1");
    mockFetch([{ status: 200, body: { version: 4, data: { "qc:section:account": "1" } } }]);
    const result = await syncNow({ accountChange: "reset" });
    expect(localStorage.getItem("qc:section:theirs")).toBeNull();
    expect(localStorage.getItem("qc:section:account")).toBe("1");
    expect(result.pushed).toBe(false); // merged equals the account copy exactly
    expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).sub).toBe("user-1");
  });

  it("surfaces a persistent conflict as an error after one retry", async () => {
    mockFetch([
      { status: 200, body: { version: 1, data: { "qc:x": "a" } } },
      { status: 409 },
      { status: 200, body: { version: 2, data: { "qc:x": "a" } } },
      { status: 409 },
    ]);
    localStorage.setItem("qc:x", "b"); // local difference forces a push each round
    await expect(syncNow()).rejects.toThrow(/conflict/);
  });
});

describe("exitFlush", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLastGoodSync();
    process.env.NEXT_PUBLIC_SYNC_URL = "https://sync.example";
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SYNC_URL;
  });

  /** A pull-only successful sync that seeds the cached header/version/data. */
  async function seedSync(version: number, data: Record<string, string>) {
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    mockFetch([{ status: 200, body: { version, data } }]);
    await syncNow();
  }

  /** Let a survived flush's fire-and-forget response handler run (real timers). */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("skips before any successful sync — no cached auth header, nothing leaves", async () => {
    localStorage.setItem("qc:section:new", "1");
    const calls = mockFetch([]);
    expect(exitFlush()).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("skips when nothing is unsynced", async () => {
    await seedSync(4, { "qc:section:a": "1" });
    const calls = mockFetch([]);
    expect(exitFlush()).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("pushes unsynced keys with the cached header + keepalive against the last-known version", async () => {
    await seedSync(4, { "qc:section:a": "1" });
    localStorage.setItem("qc:section:b", "1"); // the grade that would otherwise strand
    const calls = mockFetch([{ status: 200, body: { version: 5 } }]);

    expect(exitFlush()).toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sync.example/progress");
    expect(calls[0].init?.method).toBe("PUT");
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer JWT");
    expect((calls[0].init as { keepalive?: boolean }).keepalive).toBe(true);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.baseVersion).toBe(4);
    expect(body.data).toEqual({ "qc:section:a": "1", "qc:section:b": "1" });
  });

  it("keeps server-known keys deleted locally (deletions never propagate cross-device)", async () => {
    await seedSync(4, { "qc:section:a": "1" });
    localStorage.removeItem("qc:section:a");
    localStorage.setItem("qc:section:b", "1");
    const calls = mockFetch([{ status: 200, body: { version: 5 } }]);
    expect(exitFlush()).toBe(true);
    expect(JSON.parse(String(calls[0].init?.body)).data).toEqual({
      "qc:section:a": "1",
      "qc:section:b": "1",
    });
  });

  it("names the post-push version after a sync that pushed", async () => {
    localStorage.setItem("qc:section:mine", "1");
    mockFetch([
      { status: 200, body: { version: 1, data: {} } },
      { status: 200, body: { version: 2 } },
    ]);
    await syncNow(); // pushed — the server is now at version 2
    localStorage.setItem("qc:section:later", "1");
    const calls = mockFetch([{ status: 200, body: { version: 3 } }]);
    expect(exitFlush()).toBe(true);
    expect(JSON.parse(String(calls[0].init?.body)).baseVersion).toBe(2);
  });

  it("falls back to a plain (non-keepalive) fetch when the body exceeds the 64KB cap", async () => {
    await seedSync(4, { "qc:section:a": "1" });
    localStorage.setItem("qc:card-content:huge", "x".repeat(KEEPALIVE_BODY_LIMIT + 1));
    const calls = mockFetch([{ status: 200, body: { version: 5 } }]);
    expect(exitFlush()).toBe(true);
    expect((calls[0].init as { keepalive?: boolean }).keepalive).toBe(false);
  });

  it("skips under a changed account binding — never bleeds into another account", async () => {
    await seedSync(4, { "qc:section:a": "1" });
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastSyncedAt: 1, sub: "user-OTHER" }));
    localStorage.setItem("qc:section:b", "1");
    const calls = mockFetch([]);
    expect(exitFlush()).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("a flush the page survives records the sync and advances the cached version", async () => {
    await seedSync(4, { "qc:section:a": "1" });
    const synced = jest.fn();
    window.addEventListener("qc-sync", synced);
    localStorage.setItem("qc:section:b", "1");
    const calls = mockFetch([
      { status: 200, body: { version: 5 } },
      { status: 200, body: { version: 6 } },
    ]);

    expect(exitFlush()).toBe(true);
    await settle(); // the tab was re-shown; the 200 lands

    expect(synced).toHaveBeenCalledTimes(1);
    localStorage.setItem("qc:section:c", "1");
    expect(exitFlush()).toBe(true);
    const body = JSON.parse(String(calls[1].init?.body));
    expect(body.baseVersion).toBe(5); // the survived 200 advanced the cache
    expect(body.data).toEqual({
      "qc:section:a": "1",
      "qc:section:b": "1",
      "qc:section:c": "1",
    });
    window.removeEventListener("qc-sync", synced);
  });

  it("a 409'd flush does not advance the cache — the next flush retries the old version", async () => {
    await seedSync(4, { "qc:section:a": "1" });
    localStorage.setItem("qc:section:b", "1");
    const calls = mockFetch([{ status: 409 }, { status: 200, body: { version: 5 } }]);

    expect(exitFlush()).toBe(true);
    await settle();

    localStorage.setItem("qc:section:c", "1");
    expect(exitFlush()).toBe(true);
    expect(JSON.parse(String(calls[1].init?.body)).baseVersion).toBe(4);
  });
});

describe("sync health", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLastGoodSync();
    resetSyncHealth();
    process.env.NEXT_PUBLIC_SYNC_URL = "https://sync.example";
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SYNC_URL;
  });

  const failOnce = async (status: number) => {
    mockFetch([{ status }]);
    await expect(syncNow()).rejects.toThrow();
  };

  it("starts ok", () => {
    expect(getSyncHealth()).toBe("ok");
  });

  it("one transient network/server failure shows nothing; consecutive failures degrade", async () => {
    await failOnce(500);
    expect(getSyncHealth()).toBe("ok"); // a single blip must not alarm
    for (let i = 1; i < DEGRADED_AFTER; i++) await failOnce(500);
    expect(getSyncHealth()).toBe("degraded");
  });

  it("an auth rejection (401) flips to auth immediately — retrying cannot fix it", async () => {
    await failOnce(401);
    expect(getSyncHealth()).toBe("auth");
  });

  it("a missing session token also classifies as auth", async () => {
    (fetchAuthSession as jest.Mock).mockResolvedValueOnce({ tokens: undefined });
    await expect(syncNow()).rejects.toThrow(/not signed in/);
    expect(getSyncHealth()).toBe("auth");
  });

  it("a successful sync resets both the state and the consecutive-failure count", async () => {
    for (let i = 0; i < DEGRADED_AFTER; i++) await failOnce(503);
    expect(getSyncHealth()).toBe("degraded");

    mockFetch([{ status: 200, body: { version: 1, data: {} } }]);
    await syncNow();
    expect(getSyncHealth()).toBe("ok");

    // The counter reset too: one fresh failure is a blip again, not degradation.
    await failOnce(500);
    expect(getSyncHealth()).toBe("ok");
  });

  it("SyncAccountMismatch is an explicit choice, not a health event", async () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastSyncedAt: 1, sub: "user-OTHER" }));
    for (let i = 0; i < DEGRADED_AFTER; i++) {
      mockFetch([]);
      await expect(syncNow()).rejects.toThrow(SyncAccountMismatchError);
    }
    expect(getSyncHealth()).toBe("ok");
  });

  it("notifies subscribers on transitions only, and unsubscribes cleanly", async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeSyncHealth(() => seen.push(getSyncHealth()));

    await failOnce(500); // ok -> ok: no transition, no notification
    expect(seen).toEqual([]);

    await failOnce(500); // -> degraded
    await failOnce(500); // degraded -> degraded: silent
    expect(seen).toEqual(["degraded"]);

    mockFetch([{ status: 200, body: { version: 1, data: {} } }]);
    await syncNow(); // -> ok
    expect(seen).toEqual(["degraded", "ok"]);

    unsubscribe();
    await failOnce(401);
    expect(seen).toEqual(["degraded", "ok"]); // no longer listening
    expect(getSyncHealth()).toBe("auth");
  });
});
