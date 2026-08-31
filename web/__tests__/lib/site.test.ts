import { SITE_URL, SITE_NAME, OG_IMAGE } from "@/lib/site";

describe("SITE_URL", () => {
  it("is the canonical quantumlearner.dev origin", () => {
    // Pinned to the literal, not re-derived, so a revert to the old origin
    // fails this test instead of silently passing (see PR: quantumlearner.dev
    // becomes canonical; quantum.altivum.ai becomes the 301 redirect).
    expect(SITE_URL).toBe("https://quantumlearner.dev");
  });

  it("never points at the retired quantum.altivum.ai origin", () => {
    expect(SITE_URL).not.toContain("altivum.ai");
  });
});

describe("SITE_NAME / OG_IMAGE", () => {
  it("keeps the brand name and OG image shape stable across the domain flip", () => {
    expect(SITE_NAME).toBe("Quantum Learner");
    expect(OG_IMAGE.url).toBe("/og.jpg");
    expect(OG_IMAGE.alt).toContain(SITE_NAME);
  });
});
