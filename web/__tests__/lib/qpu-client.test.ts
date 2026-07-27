/**
 * @jest-environment jsdom
 */
jest.mock("aws-amplify/auth", () => ({
  fetchAuthSession: jest.fn(async () => ({ tokens: { idToken: { toString: () => "tok" } } })),
}));

import {
  getBudget,
  getCredentialChallenge,
  claimCredential,
  isRateLimited,
  isRateLimitedOutcome,
  submitTask,
  QpuHttpError,
} from "@/lib/qpu-client";

describe("qpu-client request URL", () => {
  const OLD = process.env.NEXT_PUBLIC_QPU_URL;
  afterEach(() => {
    process.env.NEXT_PUBLIC_QPU_URL = OLD;
  });

  // A COMPLETE budget body. getBudget() now REJECTS one missing its money fields (that
  // is the whole point of the money() guard), so the URL/token tests must post a valid
  // shape or they would fail inside the parser instead of exercising the request.
  const OK_BUDGET = {
    capMicros: 2_500_000,
    spentMicros: 0,
    remainingMicros: 2_500_000,
    credentialed: true,
    completedRuns: 0,
    completedShots: 0,
    tasks: [],
  };
  const fetchOk = () =>
    jest.fn(async () => ({ ok: true, json: async () => OK_BUDGET })) as unknown as typeof fetch;

  it("collapses a trailing slash so the URL never doubles up", async () => {
    process.env.NEXT_PUBLIC_QPU_URL = "https://edge.example.net/";
    const f = fetchOk();
    global.fetch = f;
    await getBudget();
    expect(f).toHaveBeenCalledWith("https://edge.example.net/qpu/budget", expect.anything());
  });

  it("works identically when the base has no trailing slash", async () => {
    process.env.NEXT_PUBLIC_QPU_URL = "https://edge.example.net";
    const f = fetchOk();
    global.fetch = f;
    await getBudget();
    expect(f).toHaveBeenCalledWith("https://edge.example.net/qpu/budget", expect.anything());
  });

  it("carries the bearer token", async () => {
    process.env.NEXT_PUBLIC_QPU_URL = "https://edge.example.net/";
    const f = fetchOk();
    global.fetch = f;
    await getBudget();
    expect(f).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { authorization: "Bearer tok" } }));
  });
});

// The bug this locks: the deployed Lambda predated the medal counters and returned a
// budget with NO completedRuns/completedShots. The client trusted the `number` type, so
// undefined flowed into the ladder arithmetic and shipped "NaN of 1 run — out of reach"
// to production — an unknown record rendered as a permanently foreclosed medal. The
// parser now maps every untrusted field to a value its type cannot lie about.
describe("getBudget normalizes an untrusted budget body", () => {
  const OLD = process.env.NEXT_PUBLIC_QPU_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_QPU_URL = "https://edge.example.net";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_QPU_URL = OLD;
  });
  const respond = (body: unknown) => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => body,
    })) as unknown as typeof fetch;
  };
  const MONEY = {
    capMicros: 2_500_000,
    spentMicros: 0,
    remainingMicros: 2_500_000,
    credentialed: true,
  };

  it("maps ABSENT medal counters to null — the deployed-Lambda shape that shipped 'NaN of 1 run'", async () => {
    respond({ ...MONEY, tasks: [] }); // money present, counters simply not emitted
    const b = await getBudget();
    expect(b.completedRuns).toBeNull();
    expect(b.completedShots).toBeNull();
  });

  it("maps a MALFORMED counter to null rather than trusting it", async () => {
    respond({ ...MONEY, completedRuns: "3", completedShots: -1, tasks: [] });
    const b = await getBudget();
    expect(b.completedRuns).toBeNull(); // a string is not a count
    expect(b.completedShots).toBeNull(); // a negative is not a count
  });

  it("passes a real counter straight through, including a legitimate zero", async () => {
    respond({ ...MONEY, completedRuns: 0, completedShots: 250, tasks: [] });
    const b = await getBudget();
    expect(b.completedRuns).toBe(0);
    expect(b.completedShots).toBe(250);
  });

  it("REJECTS a budget missing a money field — a visible error beats rendering '$NaN'", async () => {
    respond({ credentialed: true, tasks: [] }); // no capMicros / remainingMicros
    await expect(getBudget()).rejects.toThrow();
  });

  it("defaults a missing tasks list to an empty array", async () => {
    respond({ ...MONEY });
    const b = await getBudget();
    expect(b.tasks).toEqual([]);
  });

  // Credit metering: walletCredits is a counter with the SAME honesty contract as
  // the medal counters — null means "the server did not report it" (a pre-metering
  // Lambda, or metering not configured), never a fabricated zero.
  it("passes walletCredits through, including a legitimate zero", async () => {
    respond({ ...MONEY, walletCredits: 300, tasks: [] });
    expect((await getBudget()).walletCredits).toBe(300);
    respond({ ...MONEY, walletCredits: 0, tasks: [] });
    expect((await getBudget()).walletCredits).toBe(0);
  });

  it("maps an absent or malformed walletCredits to null (pre-metering Lambda shape)", async () => {
    respond({ ...MONEY, tasks: [] });
    expect((await getBudget()).walletCredits).toBeNull();
    respond({ ...MONEY, walletCredits: "300", tasks: [] });
    expect((await getBudget()).walletCredits).toBeNull();
  });
});

describe("submitTask carries the metering shortfall through a 402", () => {
  const OLD = process.env.NEXT_PUBLIC_QPU_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_QPU_URL = "https://edge.example.net";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_QPU_URL = OLD;
  });

  it("exposes creditsNeeded on an insufficient-credits outcome", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 402,
      json: async () => ({ error: "insufficient-credits", creditsNeeded: 175 }),
    })) as unknown as typeof fetch;
    const out = await submitTask(1000, "OPENQASM 3.0;", "key-12345678");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe("insufficient-credits");
      expect(out.creditsNeeded).toBe(175);
    }
  });

  it("leaves creditsNeeded undefined on a non-metering failure", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 402,
      json: async () => ({ error: "over-lifetime-budget" }),
    })) as unknown as typeof fetch;
    const out = await submitTask(1000, "OPENQASM 3.0;", "key-12345678");
    if (!out.ok) expect(out.creditsNeeded).toBeUndefined();
  });
});

/**
 * THE WAF FIX THAT REACHED NO LEARNER. lambda/qpu/edge.yaml now answers a throttled
 * request with 429 and {"error":"rate_limited"} instead of a bare 403 — but every
 * client path threw `new Error("budget failed (429)")`, which discards the status
 * inside a message string. So a rate limit rendered as "Couldn't reach the hardware
 * service": an outage claim for a condition whose entire fix is to wait a minute.
 */
describe("a throttled QPU endpoint is distinguishable from an outage", () => {
  const OLD = process.env.NEXT_PUBLIC_QPU_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_QPU_URL = "https://edge.example.net";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_QPU_URL = OLD;
  });
  /** The deployed edge shape: a JSON body WITH the token, under status 429. */
  const respondStatus = (status: number, body: unknown = { error: "rate_limited" }) => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status,
      json: async () => body,
    })) as unknown as typeof fetch;
  };

  const calls: [string, () => Promise<unknown>][] = [
    ["getBudget", () => getBudget()],
    ["getCredentialChallenge", () => getCredentialChallenge()],
    ["claimCredential", () => claimCredential(74)],
  ];

  it.each(calls)("%s throws a QpuHttpError carrying the status", async (_name, call) => {
    respondStatus(429);
    const e = await call().then(
      () => null,
      (err: unknown) => err,
    );
    expect(e).toBeInstanceOf(QpuHttpError);
    expect((e as QpuHttpError).status).toBe(429);
    expect(isRateLimited(e)).toBe(true);
  });

  it.each(calls)("%s keeps a real failure OUT of the rate-limit branch", async (_name, call) => {
    // 500 is an outage and must keep reading as one. So is 403: on THIS path it is
    // also qpu-core.mjs's edge-secret mismatch, which is why edge.yaml was changed to
    // 429 rather than the tutor path's shared 403||429 sentence.
    for (const status of [500, 502, 403, 401]) {
      respondStatus(status, "not json");
      const e = await call().then(
        () => null,
        (err: unknown) => err,
      );
      expect(e).toBeInstanceOf(QpuHttpError);
      expect(isRateLimited(e)).toBe(false);
    }
  });

  it("keeps the thrown message text intact, status and all", async () => {
    respondStatus(429);
    await expect(getBudget()).rejects.toThrow("budget failed (429)");
  });

  it("does not mistake a non-QpuHttpError failure for a throttle", () => {
    expect(isRateLimited(new Error("budget failed (429)"))).toBe(false); // the OLD throw
    expect(isRateLimited(new TypeError("Failed to fetch"))).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
  });
});

/**
 * The RESOLVED-submit half. submitTask() returns its status instead of throwing, and
 * `error` is parsed from a body that may not be JSON — so keying on the token alone
 * would be dead code today: an undeployed distribution still blocks with WAF's default
 * 403 and a non-JSON body, and `error` becomes the synthesised "submit failed (403)".
 */
describe("isRateLimitedOutcome", () => {
  it("matches the deployed edge on EITHER the status or the token", () => {
    expect(isRateLimitedOutcome(429, "rate_limited")).toBe(true);
    expect(isRateLimitedOutcome(429, "submit failed (429)")).toBe(true); // non-JSON 429
    expect(isRateLimitedOutcome(200, "rate_limited")).toBe(true); // token alone suffices
  });

  it("leaves every ambiguous or unrelated failure alone — 403 included", () => {
    // 403 is the edge-secret mismatch too; calling it a throttle would tell a learner
    // to wait a minute for a misconfiguration that will never clear on its own.
    expect(isRateLimitedOutcome(403, "submit failed (403)")).toBe(false);
    expect(isRateLimitedOutcome(402, "over-lifetime-budget")).toBe(false);
    expect(isRateLimitedOutcome(500, "braket-submit-failed")).toBe(false);
  });
});
