import { diracString, formatAmplitude } from "@/components/quantum/state-readout";
import { simulate, type Complex } from "@/components/quantum/math";

describe("formatAmplitude", () => {
  it("renders a real amplitude to 2dp", () => {
    expect(formatAmplitude([0.7071, 0])).toBe("0.71");
  });
  it("snaps near-zero components to zero", () => {
    expect(formatAmplitude([1e-4, 1])).toBe("1.00i");
  });
  it("renders a full complex amplitude", () => {
    expect(formatAmplitude([0.5, -0.5])).toBe("(0.50-0.50i)");
  });
});

describe("diracString", () => {
  it("writes |0> for the ground state", () => {
    expect(diracString(simulate([], 1), 1)).toBe("1.00|0⟩");
  });
  it("never renders a phantom 0.00 term (filter agrees with the formatter)", () => {
    // A component below the display epsilon is filtered out, not shown as "0.00".
    const state: Complex[] = [
      [0.9999, 0],
      [0.004, 0],
    ];
    const s = diracString(state, 1);
    expect(s).not.toContain("0.00|");
    expect(s).toBe("1.00|0⟩");
  });
  it("writes the Bell state as a sum of |00> and |11>", () => {
    const bell = simulate(
      [
        { gate: "H", target: 0 },
        { gate: "CNOT", control: 0, target: 1 },
      ] as { gate: string; target: number; control?: number }[],
      2
    );
    const s = diracString(bell, 2);
    expect(s).toContain("|00⟩");
    expect(s).toContain("|11⟩");
    expect(s).not.toContain("|01⟩");
  });
  it("drops negligible amplitudes", () => {
    const onlyOne = simulate([{ gate: "X", target: 0 }], 1) as Complex[];
    expect(diracString(onlyOne, 1)).toBe("1.00|1⟩");
  });
});

describe("diracString sign-aware assembly", () => {
  it("renders a negative non-first term with a minus separator, not '+ -'", () => {
    // The core bug-3 regression: H then Z gives 0.71|0> - 0.71|1>.
    const state: Complex[] = [
      [0.7071, 0],
      [-0.7071, 0],
    ];
    expect(diracString(state, 1)).toBe("0.71|0⟩ - 0.71|1⟩");
  });
  it("keeps a bare leading minus on a negative first term", () => {
    const state: Complex[] = [
      [-0.7071, 0],
      [0.7071, 0],
    ];
    expect(diracString(state, 1)).toBe("-0.71|0⟩ + 0.71|1⟩");
  });
  it("uses a minus separator for a negative imaginary amplitude", () => {
    const state: Complex[] = [
      [0.7071, 0],
      [0, -0.7071],
    ];
    expect(diracString(state, 1)).toBe("0.71|0⟩ - 0.71i|1⟩");
  });
  it("keeps a compound amplitude paren-wrapped with a positive separator", () => {
    const state: Complex[] = [
      [0.7071, 0],
      [-0.5, 0.5],
    ];
    const s = diracString(state, 1);
    expect(s).toContain(" + (-0.50+0.50i)|");
    expect(s).not.toContain("+ -");
    expect(s).not.toContain("+  -");
  });
  it("never emits a '+ -' sequence for any signed superposition", () => {
    const state: Complex[] = [
      [0.5, 0],
      [-0.5, 0],
      [0, -0.5],
      [-0.5, 0],
    ];
    expect(diracString(state, 2)).not.toMatch(/\+\s+-/);
  });
});
