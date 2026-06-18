import { noisyProbs, fidelityDist, noisyRho, stateFidelity } from "@/components/quantum/noise";
import { parseProgram, opsFor } from "@/components/quantum/qsim-dsl";
import { simulate } from "@/components/quantum/math";

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

  it("stateFidelity is 1 with no noise and ~0 when amplitude damping relaxes |1> to |0>", () => {
    const { ops: o, n } = ops("qubits 1\nX 0"); // |1>
    const psi = simulate(o, n);
    expect(stateFidelity(psi, noisyRho(o, n, "amplitude-damping", 0))).toBeCloseTo(1, 8);
    expect(stateFidelity(psi, noisyRho(o, n, "amplitude-damping", 1))).toBeLessThan(0.01);
  });

  it("stateFidelity sees coherence loss the diagonal misses: |+> under p=0.75 depolarizing has true F=0.5 while distribution overlap reads 1", () => {
    const { ops: o, n } = ops("qubits 1\nH 0"); // |+>
    const psi = simulate(o, n);
    const rho = noisyRho(o, n, "depolarizing", 0.75); // -> maximally mixed I/2
    const diag = rho.map((row, i) => row[i][0]);
    // measurement probabilities are still 0.5/0.5, so the classical overlap is 1...
    expect(fidelityDist([0.5, 0.5], diag)).toBeCloseTo(1, 6);
    // ...but the TRUE state fidelity has dropped to 0.5 (the bug the fix addresses).
    expect(stateFidelity(psi, rho)).toBeCloseTo(0.5, 6);
  });
});
