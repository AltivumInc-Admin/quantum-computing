/**
 * @jest-environment jsdom
 */
jest.mock("aws-amplify/auth", () => ({
  fetchAuthSession: jest.fn(async () => ({ tokens: { idToken: { toString: () => "tok" } } })),
}));

import { getBudget } from "@/lib/qpu-client";

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
});
