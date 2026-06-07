import { noisyProbs, fidelityDist } from "@/components/quantum/noise";
import { parseProgram, opsFor } from "@/components/quantum/qsim-dsl";

function ops(src: string) {
  const p = parseProgram(src);
  return { ops: opsFor(p, 0), n: p.n };
}

describe("noise engine", () => {
  it("p=0 reproduces the ideal distribution (H on 1 qubit)", () => {
    const { ops: o, n } = ops("qubits 1\nH 0");
    const got = noisyProbs(o, n, "depolarizing", 0);
    expect(got[0]).toBeCloseTo(0.5, 8);
    expect(got[1]).toBeCloseTo(0.5, 8);
  });
  it("depolarizing p=0.75 drives one qubit to maximally mixed", () => {
    const { ops: o, n } = ops("qubits 1\nX 0");
    const got = noisyProbs(o, n, "depolarizing", 0.75);
    expect(got[0]).toBeCloseTo(0.5, 6);
    expect(got[1]).toBeCloseTo(0.5, 6);
  });
  it("amplitude damping gamma=1 relaxes |1> to |0>", () => {
    const { ops: o, n } = ops("qubits 1\nX 0");
    const got = noisyProbs(o, n, "amplitude-damping", 1);
    expect(got[0]).toBeCloseTo(1, 6);
    expect(got[1]).toBeCloseTo(0, 6);
  });
  it("bit-flip p=1 flips |0> (identity gate carries the channel)", () => {
    const { ops: o, n } = ops("qubits 1\nI 0");
    const got = noisyProbs(o, n, "bit-flip", 1);
    expect(got[0]).toBeCloseTo(0, 6);
    expect(got[1]).toBeCloseTo(1, 6);
  });
  it("noisy probabilities sum to 1", () => {
    const { ops: o, n } = ops("qubits 2\nH 0\nCNOT 0 1");
    const got = noisyProbs(o, n, "depolarizing", 0.2);
    expect(got.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it("rejects more than 3 qubits", () => {
    expect(() => noisyProbs([], 4, "depolarizing", 0.1)).toThrow();
  });
  it("fidelityDist is 1 for identical distributions", () => {
    expect(fidelityDist([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(1, 8);
  });
});
