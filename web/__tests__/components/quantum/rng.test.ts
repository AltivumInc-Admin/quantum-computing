import { mulberry32, gauss } from "@/components/quantum/rng";

describe("mulberry32", () => {
  it("yields values in [0, 1)", () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("is deterministic per seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
  it("differs across seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("gauss", () => {
  it("stays finite when rng() === 0 (pins the 1e-12 log guard)", () => {
    // Without the guard: log(0) -> -Infinity -> sqrt(Infinity) * cos -> NaN/Infinity.
    expect(Number.isFinite(gauss(() => 0))).toBe(true);
  });
  it("is deterministic for a seeded rng", () => {
    expect(gauss(mulberry32(7))).toBe(gauss(mulberry32(7)));
  });
  it("produces a roughly zero-mean sample stream", () => {
    const rng = mulberry32(99);
    let sum = 0;
    for (let i = 0; i < 4000; i++) sum += gauss(rng);
    expect(Math.abs(sum / 4000)).toBeLessThan(0.1);
  });
});
