import { djProbabilities, isConstant, ORACLES } from "@/components/quantum/deutsch-jozsa";

describe("deutsch-jozsa", () => {
  it("constant oracle -> P(all-zeros) = 1", () => {
    for (const n of [2, 3]) {
      expect(djProbabilities(n, ORACLES.constant0)[0]).toBeCloseTo(1, 10);
      expect(djProbabilities(n, ORACLES.constant1)[0]).toBeCloseTo(1, 10);
    }
  });
  it("balanced oracle -> P(all-zeros) = 0", () => {
    for (const n of [2, 3]) {
      expect(djProbabilities(n, ORACLES.parity)[0]).toBeCloseTo(0, 10);
      expect(djProbabilities(n, ORACLES.lowbit)[0]).toBeCloseTo(0, 10);
    }
  });
  it("probabilities sum to 1", () => {
    const p = djProbabilities(3, ORACLES.parity);
    expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
  });
  it("isConstant verdict matches the oracle", () => {
    expect(isConstant(djProbabilities(3, ORACLES.constant0))).toBe(true);
    expect(isConstant(djProbabilities(3, ORACLES.parity))).toBe(false);
  });
  it("rejects more than 3 qubits", () => {
    expect(() => djProbabilities(4, ORACLES.constant0)).toThrow();
  });
});
