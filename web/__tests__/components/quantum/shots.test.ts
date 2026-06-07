import { sampleCounts } from "@/components/quantum/shots";

describe("sampleCounts", () => {
  it("returns counts that sum to N over the right number of outcomes", () => {
    const counts = sampleCounts([0.25, 0.25, 0.25, 0.25], 100, mulberry32(1));
    expect(counts).toHaveLength(4);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("never samples a zero-probability outcome", () => {
    const counts = sampleCounts([0.5, 0, 0.5, 0], 500, mulberry32(7));
    expect(counts[1]).toBe(0);
    expect(counts[3]).toBe(0);
    expect(counts[0] + counts[2]).toBe(500);
  });
  it("is deterministic for a fixed RNG seed", () => {
    const a = sampleCounts([0.7, 0.3], 1000, mulberry32(42));
    const b = sampleCounts([0.7, 0.3], 1000, mulberry32(42));
    expect(a).toEqual(b);
  });
  it("converges toward the true distribution for large N", () => {
    const counts = sampleCounts([0.7, 0.3], 50000, mulberry32(123));
    expect(counts[0] / 50000).toBeCloseTo(0.7, 1);
  });
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
