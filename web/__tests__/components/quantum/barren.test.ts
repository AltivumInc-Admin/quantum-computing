import { gradientVariance, mulberry32 } from "@/components/quantum/barren";

describe("barren", () => {
  it("global-cost gradient variance collapses with qubit count (L=2)", () => {
    const v2 = gradientVariance(2, 2, "global", 300, mulberry32(1));
    const v6 = gradientVariance(6, 2, "global", 300, mulberry32(1));
    expect(v6).toBeLessThan(v2 * 0.5); // markedly smaller (verified ~2x/qubit)
    expect(v6).toBeGreaterThan(0);
  });
  it("local cost stays in a band across n at shallow depth (does NOT collapse like global)", () => {
    const l2 = gradientVariance(2, 2, "local", 300, mulberry32(2));
    const l6 = gradientVariance(6, 2, "local", 300, mulberry32(2));
    expect(l6).toBeGreaterThan(l2 * 0.25); // local far flatter than global
  });
  it("the probed local gradient is not a structural zero (param in q0's cone)", () => {
    expect(gradientVariance(4, 2, "local", 200, mulberry32(3))).toBeGreaterThan(1e-4);
  });
  it("is deterministic for a fixed seed", () => {
    expect(gradientVariance(4, 2, "global", 100, mulberry32(9)))
      .toBeCloseTo(gradientVariance(4, 2, "global", 100, mulberry32(9)), 12);
  });
});
