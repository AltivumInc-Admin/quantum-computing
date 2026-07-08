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

  const fetchOk = () =>
    jest.fn(async () => ({ ok: true, json: async () => ({ tasks: [] }) })) as unknown as typeof fetch;

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
