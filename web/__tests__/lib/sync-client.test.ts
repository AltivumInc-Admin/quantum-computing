/**
 * @jest-environment jsdom
 */
import {
  syncNow,
  lastSyncedAt,
  isSyncConfigured,
  SyncAccountMismatchError,
  SYNC_META_KEY,
} from "@/lib/sync-client";

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
