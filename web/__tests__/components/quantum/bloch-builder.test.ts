import { stateFromAngles, probsFromAngles } from "@/components/quantum/bloch-builder";
import { diracString } from "@/components/quantum/state-readout";

describe("stateFromAngles", () => {
  it("θ=0 gives |0>", () => {
    const s = stateFromAngles(0, 0);
    expect(s[0][0]).toBeCloseTo(1, 10);
    expect(s[1][0]).toBeCloseTo(0, 10);
    expect(s[1][1]).toBeCloseTo(0, 10);
  });
  it("θ=π gives |1>", () => {
    const s = stateFromAngles(Math.PI, 0);
    expect(s[0][0]).toBeCloseTo(0, 10);
    expect(s[1][0]).toBeCloseTo(1, 10);
  });
  it("θ=π/2, φ=0 gives |+>", () => {
    const s = stateFromAngles(Math.PI / 2, 0);
    expect(s[0][0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(s[1][0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(s[1][1]).toBeCloseTo(0, 10);
    expect(diracString(s, 1)).toContain("|0⟩");
  });
  it("θ=π/2, φ=π/2 puts the phase on |1> (imaginary)", () => {
    const s = stateFromAngles(Math.PI / 2, Math.PI / 2);
    expect(s[1][0]).toBeCloseTo(0, 10);
    expect(s[1][1]).toBeCloseTo(Math.SQRT1_2, 10);
  });
  it("probsFromAngles obeys cos²(θ/2), sin²(θ/2)", () => {
    const { p0, p1 } = probsFromAngles(Math.PI / 3);
    expect(p0).toBeCloseTo(Math.cos(Math.PI / 6) ** 2, 10);
    expect(p1).toBeCloseTo(Math.sin(Math.PI / 6) ** 2, 10);
    expect(p0 + p1).toBeCloseTo(1, 10);
  });
});
