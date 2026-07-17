/**
 * @jest-environment node
 */
// web/__tests__/lib/billing-client.test.ts
import {
  startCheckout,
  openPortal,
  getWallet,
  isBillingConfigured,
  billingUrl,
  BillingAuthError,
} from "@/lib/billing-client";

jest.mock("aws-amplify/auth", () => ({ fetchAuthSession: jest.fn() }));
import { fetchAuthSession } from "aws-amplify/auth";

const ENV = {
  NEXT_PUBLIC_BILLING_URL: "https://billing.example.com",
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: "us-east-2_Pool",
  NEXT_PUBLIC_COGNITO_CLIENT_ID: "client",
  NEXT_PUBLIC_COGNITO_DOMAIN: "auth.example.com",
  NEXT_PUBLIC_AWS_REGION: "us-east-2",
} as const;

function setEnv(on: boolean) {
  for (const [k, v] of Object.entries(ENV)) {
    if (on) process.env[k] = v;
    else delete process.env[k];
  }
}

const withToken = () =>
  (fetchAuthSession as jest.Mock).mockResolvedValue({ tokens: { idToken: { toString: () => "idtok" } } });

beforeEach(() => {
  setEnv(true);
  withToken();
  global.fetch = jest.fn();
});
afterEach(() => {
  setEnv(false);
  jest.clearAllMocks();
});

test("billing is configured only when the URL and the Cognito vars are present", () => {
  expect(isBillingConfigured()).toBe(true);
  delete process.env.NEXT_PUBLIC_BILLING_URL;
  expect(billingUrl()).toBeNull();
  expect(isBillingConfigured()).toBe(false);
  process.env.NEXT_PUBLIC_BILLING_URL = ENV.NEXT_PUBLIC_BILLING_URL; // restore the URL half
  delete process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  expect(isBillingConfigured()).toBe(false); // auth half missing
});

test("startCheckout posts the lookup key with a bearer token and returns the URL", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_1" }),
  });
  const url = await startCheckout("ql_plus_monthly");
  expect(url).toBe("https://checkout.stripe.com/c/pay/cs_1");
  const [endpoint, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(endpoint).toBe("https://billing.example.com/checkout");
  expect(init.method).toBe("POST");
  expect(init.headers.authorization).toBe("Bearer idtok");
  expect(JSON.parse(init.body)).toEqual({ lookupKey: "ql_plus_monthly" });
});

test("startCheckout throws BillingAuthError when there is no token", async () => {
  (fetchAuthSession as jest.Mock).mockResolvedValue({ tokens: undefined });
  await expect(startCheckout("ql_pro_monthly")).rejects.toBeInstanceOf(BillingAuthError);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("startCheckout throws BillingHttpError carrying the status on a non-2xx", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400 });
  await expect(startCheckout("ql_credits_2000")).rejects.toMatchObject({
    name: "BillingHttpError",
    status: 400,
  });
});

test("getWallet returns the tier, balance, and status", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ tier: "plus", credits: 1890, subscriptionStatus: "active" }),
  });
  expect(await getWallet()).toEqual({ tier: "plus", credits: 1890, subscriptionStatus: "active" });
  const [endpoint] = (global.fetch as jest.Mock).mock.calls[0];
  expect(endpoint).toBe("https://billing.example.com/wallet");
});

test("startTopUp posts the custom amount and returns the URL", async () => {
  const { startTopUp } = await import("@/lib/billing-client");
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_37" }),
  });
  expect(await startTopUp(37)).toBe("https://checkout.stripe.com/c/pay/cs_37");
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(JSON.parse(init.body)).toEqual({ amountUsd: 37 });
});

test("startTopUp rejects out-of-range amounts client-side without a request", async () => {
  const { startTopUp } = await import("@/lib/billing-client");
  for (const bad of [4, 501, 12.5]) {
    await expect(startTopUp(bad)).rejects.toThrow(/whole dollar amount/);
  }
  expect(global.fetch).not.toHaveBeenCalled();
});

test("openPortal returns the portal URL", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ url: "https://billing.stripe.com/p/1" }) });
  expect(await openPortal()).toBe("https://billing.stripe.com/p/1");
});
