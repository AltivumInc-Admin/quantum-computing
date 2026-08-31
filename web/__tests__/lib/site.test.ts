import { SITE_URL, SITE_NAME, OG_IMAGE } from "@/lib/site";

describe("SITE_URL", () => {
  it("is the canonical learner.quantumenv.dev origin", () => {
    // Pinned to the literal, not re-derived, so a revert to an old origin
    // fails this test instead of silently passing (platform-subdomain
    // migration: learner.quantumenv.dev becomes canonical; quantumlearner.dev
    // becomes the vanity redirect, quantum.altivum.ai stays a 301).
    expect(SITE_URL).toBe("https://learner.quantumenv.dev");
  });

  it("never points at a retired origin", () => {
    expect(SITE_URL).not.toContain("altivum.ai");
    expect(SITE_URL).not.toBe("https://quantumlearner.dev");
  });
});

describe("SITE_NAME / OG_IMAGE", () => {
  it("keeps the brand name and OG image shape stable across the domain flip", () => {
    expect(SITE_NAME).toBe("Quantum Learner");
    expect(OG_IMAGE.url).toBe("/og.jpg");
    expect(OG_IMAGE.alt).toContain(SITE_NAME);
  });
});
