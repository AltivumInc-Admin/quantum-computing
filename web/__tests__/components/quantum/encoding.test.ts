import { angleState, amplitudeState, iqpState, fidelity, reducedBloch } from "@/components/quantum/encoding";
import { blochVector } from "@/components/quantum/math";

describe("encoding", () => {
  it("angleState(pi,0): qubit 0 -> |1> (amplitude on |10>, index 2)", () => {
    const s = angleState(Math.PI, 0);
    expect(s[2][0]).toBeCloseTo(1, 8); // |10>
  });
  it("angle kernel closed form: |<phi(x)|phi(x')>|^2 = prod cos^2((xi-xi')/2)", () => {
    const x = [0.7, 1.2], y = [0.3, -0.4];
    const expected = Math.cos((x[0] - y[0]) / 2) ** 2 * Math.cos((x[1] - y[1]) / 2) ** 2;
    expect(fidelity(angleState(x[0], x[1]), angleState(y[0], y[1]))).toBeCloseTo(expected, 8);
  });
  it("self-fidelity is 1 for all encodings", () => {
    expect(fidelity(angleState(0.5, 0.9), angleState(0.5, 0.9))).toBeCloseTo(1, 8);
    expect(fidelity(iqpState(0.5, 0.9), iqpState(0.5, 0.9))).toBeCloseTo(1, 8);
  });
  it("amplitudeState normalizes (1 qubit for 2 features) and guards the zero vector", () => {
    const s = amplitudeState([0.6, -0.8]);
    expect(s).toHaveLength(2);
    expect(s.reduce((acc, c) => acc + c[0] * c[0] + c[1] * c[1], 0)).toBeCloseTo(1, 9);
    const z = amplitudeState([0, 0]);
    expect(z[0][0]).toBeCloseTo(1, 9); // falls back to |0>
  });
  it("iqpState has norm 1", () => {
    const s = iqpState(0.7, 1.1);
    expect(s.reduce((acc, c) => acc + c[0] * c[0] + c[1] * c[1], 0)).toBeCloseTo(1, 9);
  });

  it("reducedBloch on a product (angle) state equals the pure single-qubit Bloch vector (|r|=1)", () => {
    const s = angleState(0.7, 1.2); // product: RY(0.7) (X) RY(1.2)
    const pure0 = blochVector([[Math.cos(0.35), 0], [Math.sin(0.35), 0]]); // RY(0.7)|0>
    const r0 = reducedBloch(s, 0);
    expect(r0.x).toBeCloseTo(pure0.x, 8);
    expect(r0.y).toBeCloseTo(pure0.y, 8);
    expect(r0.z).toBeCloseTo(pure0.z, 8);
    expect(Math.hypot(r0.x, r0.y, r0.z)).toBeCloseTo(1, 8); // pure reduced state
  });

  it("reducedBloch on an entangled IQP state is mixed (|r| < 1) — the bug that drew product dials", () => {
    const s = iqpState(0.6, 0.9);
    const r0 = reducedBloch(s, 0);
    const r1 = reducedBloch(s, 1);
    expect(Math.hypot(r0.x, r0.y, r0.z)).toBeLessThan(1);
    expect(Math.hypot(r1.x, r1.y, r1.z)).toBeLessThan(1);
  });
});
