import { qft, basisState, periodicState } from "@/components/quantum/qft";

const mag = (c: [number, number]) => Math.hypot(c[0], c[1]);

describe("qft", () => {
  it("QFT of |0> is uniform magnitude 1/sqrt(N)", () => {
    const out = qft(basisState(3, 0)); // N=8
    out.forEach((c) => expect(mag(c)).toBeCloseTo(1 / Math.sqrt(8), 10));
  });
  it("is norm-preserving", () => {
    const out = qft(periodicState(4, 4));
    const norm = out.reduce((s, c) => s + c[0] * c[0] + c[1] * c[1], 0);
    expect(norm).toBeCloseTo(1, 10);
  });
  it("period-r comb -> spikes every N/r, zero elsewhere", () => {
    const N = 16, r = 4; // spikes at multiples of N/r = 4
    const out = qft(periodicState(4, r));
    for (let k = 0; k < N; k++) {
      if (k % (N / r) === 0) expect(mag(out[k])).toBeGreaterThan(0.1);
      else expect(mag(out[k])).toBeLessThan(1e-9);
    }
  });
});
