/**
 * @jest-environment jsdom
 */
import {
  isReviewPrefsConfigured,
  getReminderPrefs,
  setReminderPrefs,
  deleteReminderPrefs,
} from "@/lib/review-prefs-client";

jest.mock("aws-amplify/auth", () => ({
  fetchAuthSession: jest.fn(async () => ({
    tokens: { idToken: { toString: () => "JWT", payload: { sub: "user-1" } } },
  })),
}));
jest.mock("@/lib/auth-config", () => ({ isAuthConfigured: () => true }));

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

describe("review-prefs-client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_REVIEW_PREFS_URL = "https://prefs.example";
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_REVIEW_PREFS_URL;
  });

  it("is gated on the env var", () => {
    delete process.env.NEXT_PUBLIC_REVIEW_PREFS_URL;
    expect(isReviewPrefsConfigured()).toBe(false);
  });

  it("is configured when the env var and auth are both present", () => {
    expect(isReviewPrefsConfigured()).toBe(true);
  });

  it("GET reads /prefs with the bearer token and no user id in the request", async () => {
    const calls = mockFetch([{ status: 200, body: { remindersOn: true } }]);
    const res = await getReminderPrefs();
    expect(res).toEqual({ remindersOn: true });
    expect(calls[0].url).toBe("https://prefs.example/prefs");
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer JWT");
    expect(calls[0].init?.body).toBeUndefined();
  });

  it("PUT writes the boolean, nothing else (identity comes from the token)", async () => {
    const calls = mockFetch([{ status: 200, body: { remindersOn: true } }]);
    await setReminderPrefs(true);
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ remindersOn: true });
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer JWT");
  });

  it("DELETE removes the prefs row", async () => {
    const calls = mockFetch([{ status: 200, body: { deleted: true } }]);
    await deleteReminderPrefs();
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe("https://prefs.example/prefs");
  });

  it("collapses a trailing slash in the base URL", async () => {
    process.env.NEXT_PUBLIC_REVIEW_PREFS_URL = "https://prefs.example/";
    const calls = mockFetch([{ status: 200, body: { remindersOn: false } }]);
    await getReminderPrefs();
    expect(calls[0].url).toBe("https://prefs.example/prefs");
  });

  it("surfaces non-2xx as errors", async () => {
    mockFetch([{ status: 500 }]);
    await expect(getReminderPrefs()).rejects.toThrow(/failed \(500\)/);
    mockFetch([{ status: 403 }]);
    await expect(setReminderPrefs(false)).rejects.toThrow(/failed \(403\)/);
    mockFetch([{ status: 500 }]);
    await expect(deleteReminderPrefs()).rejects.toThrow(/failed \(500\)/);
  });

  it("throws NotSignedIn when there is no token", async () => {
    const { fetchAuthSession } = jest.requireMock("aws-amplify/auth") as {
      fetchAuthSession: jest.Mock;
    };
    fetchAuthSession.mockResolvedValueOnce({ tokens: undefined });
    const calls = mockFetch([]);
    await expect(getReminderPrefs()).rejects.toMatchObject({ name: "NotSignedIn" });
    expect(calls).toHaveLength(0); // nothing left the device
  });
});
