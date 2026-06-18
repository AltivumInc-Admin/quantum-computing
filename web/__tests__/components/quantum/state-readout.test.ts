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
