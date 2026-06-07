import { uniform, groverIteration, groverHistory, optimalIterations } from "@/components/quantum/grover";

describe("grover", () => {
  it("uniform start has equal amplitudes summing-of-squares to 1", () => {
    const a = uniform(3); // N=8
    expect(a).toHaveLength(8);
    a.forEach((x) => expect(x).toBeCloseTo(1 / Math.sqrt(8), 12));
    expect(a.reduce((s, x) => s + x * x, 0)).toBeCloseTo(1, 12);
  });
  it("N=4: exactly 1 iteration gives P(marked)=1", () => {
    const hist = groverHistory(2, 2, 1); // n=2, marked=2, 1 iter
    const amp = hist[1][2];
    expect(amp * amp).toBeCloseTo(1, 10);
  });
  it("N=8: optimal=2 and P(marked)=121/128 at 2 iterations", () => {
    expect(optimalIterations(3)).toBe(2);
    const hist = groverHistory(3, 5, 2);
    expect(hist[3 - 1][5] ** 2).toBeCloseTo(121 / 128, 10); // hist[2] = after 2 iters
  });
  it("each iteration preserves normalization", () => {
    let a = uniform(3);
    for (let k = 0; k < 5; k++) {
      a = groverIteration(a, 5);
      expect(a.reduce((s, x) => s + x * x, 0)).toBeCloseTo(1, 10);
    }
  });
  it("rejects more than 4 qubits", () => {
    expect(() => groverHistory(5, 0, 1)).toThrow();
  });
});
