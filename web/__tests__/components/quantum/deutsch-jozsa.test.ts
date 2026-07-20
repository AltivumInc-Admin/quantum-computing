import { djProbabilities, isConstant, ORACLES } from "@/components/quantum/deutsch-jozsa";

describe("deutsch-jozsa", () => {
  it("constant oracle -> P(all-zeros) = 1", () => {
    for (const n of [2, 3]) {
      expect(djProbabilities(n, ORACLES.constant0.f)[0]).toBeCloseTo(1, 10);
      expect(djProbabilities(n, ORACLES.constant1.f)[0]).toBeCloseTo(1, 10);
    }
  });
  it("balanced oracle -> P(all-zeros) = 0", () => {
    for (const n of [2, 3]) {
      expect(djProbabilities(n, ORACLES.parity.f)[0]).toBeCloseTo(0, 10);
      expect(djProbabilities(n, ORACLES.lowbit.f)[0]).toBeCloseTo(0, 10);
    }
  });
  it("probabilities sum to 1", () => {
    const p = djProbabilities(3, ORACLES.parity.f);
    expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
  });
  it("isConstant verdict matches the oracle", () => {
    expect(isConstant(djProbabilities(3, ORACLES.constant0.f))).toBe(true);
    expect(isConstant(djProbabilities(3, ORACLES.parity.f))).toBe(false);
  });
  it("rejects more than 3 qubits", () => {
    expect(() => djProbabilities(4, ORACLES.constant0.f)).toThrow();
  });
  it("every oracle carries its own display label (no parallel map to drift)", () => {
    // The label used to live in dj-demo as a second Record keyed by these same
    // strings; co-locating it means a new oracle cannot ship label-less.
    for (const entry of Object.values(ORACLES)) {
      expect(typeof entry.f).toBe("function");
      expect(entry.label).toMatch(/^f\(x\) = /);
    }
  });
});
