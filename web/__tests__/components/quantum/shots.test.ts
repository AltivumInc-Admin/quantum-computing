import { sampleCounts, sampleIndex } from "@/components/quantum/shots";
import { mulberry32 } from "@/components/quantum/rng";

describe("sampleIndex", () => {
  it("skips a leading zero-probability bucket even when rng() === 0", () => {
    // r = 0 satisfies r <= acc at i = 0, but the probs[i] > 0 clause skips it.
    expect(sampleIndex([0, 0.5, 0.5, 0], () => 0)).toBe(1);
  });
  it("resolves r just under the total to the last positive bucket (tail accumulation)", () => {
    // NOTE: this pins <= accumulation at the tail, NOT the zero-mass guard —
    // for trailing zeros, acc at the last positive bucket equals the reduce
    // total bit-for-bit, so r < total can never reach a trailing zero bucket.
    // The guard itself is pinned by the leading-zero rng()===0 tests above.
    expect(sampleIndex([0.5, 0.5, 0], () => 0.9999999999999999)).toBe(1);
  });
});

describe("sampleCounts", () => {
  it("puts every draw in the sole reachable bucket when rng() === 0", () => {
    expect(sampleCounts([0, 0.5, 0.5, 0], 50, () => 0)).toEqual([0, 50, 0, 0]);
  });
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
