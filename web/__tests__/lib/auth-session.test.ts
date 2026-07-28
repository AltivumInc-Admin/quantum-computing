/**
 * @jest-environment jsdom
 */
const fetchAuthSession = jest.fn();
jest.mock("aws-amplify/auth", () => ({
  fetchAuthSession: (...a: unknown[]) => fetchAuthSession(...a),
}));

import { hasUserPoolAdminScope, USER_POOL_ADMIN_SCOPE } from "@/lib/auth-session";

const withScope = (scope: unknown) => ({ tokens: { accessToken: { payload: { scope } } } });

describe("hasUserPoolAdminScope", () => {
  beforeEach(() => fetchAuthSession.mockReset());

  it("is true for a native sign-in, whose access token carries the admin scope", async () => {
    fetchAuthSession.mockResolvedValue(withScope(`openid ${USER_POOL_ADMIN_SCOPE} email`));
    await expect(hasUserPoolAdminScope()).resolves.toBe(true);
  });

  it("is false for a hosted-UI session — the app client grants only openid/email/profile", async () => {
    fetchAuthSession.mockResolvedValue(withScope("openid email profile"));
    await expect(hasUserPoolAdminScope()).resolves.toBe(false);
  });

  it("does not match on a substring of a longer scope name", async () => {
    fetchAuthSession.mockResolvedValue(withScope(`${USER_POOL_ADMIN_SCOPE}.readonly`));
    await expect(hasUserPoolAdminScope()).resolves.toBe(false);
  });

  // The fail-safe direction matters: callers gate destructive work on this, so an
  // unreadable session must read as "cannot", never as "can".
  it("is false when the session carries no readable scope claim", async () => {
    fetchAuthSession.mockResolvedValue({ tokens: { accessToken: { payload: {} } } });
    await expect(hasUserPoolAdminScope()).resolves.toBe(false);
  });

  it("is false when there is no session at all", async () => {
    fetchAuthSession.mockResolvedValue({});
    await expect(hasUserPoolAdminScope()).resolves.toBe(false);
  });

  it("is false when fetching the session throws", async () => {
    fetchAuthSession.mockRejectedValue(new Error("network"));
    await expect(hasUserPoolAdminScope()).resolves.toBe(false);
  });
});
