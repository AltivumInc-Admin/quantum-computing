import {
  simulate,
  simulateSteps,
  statesApproxEqual,
  zeroState,
  type Complex,
} from "@/components/quantum/math";

describe("simulateSteps (gate-by-gate snapshots for the wavefunction scrubber)", () => {
  it("returns one frame per op plus the initial state", () => {
    const ops = [
      { gate: "H", target: 0 },
      { gate: "CNOT", control: 0, target: 1 },
    ];
    expect(simulateSteps(ops, 2)).toHaveLength(3);
  });

  it("frame 0 is the |0...0> initial state", () => {
    const frames = simulateSteps([{ gate: "X", target: 0 }], 1);
    expect(frames[0]).toEqual(zeroState(1));
  });

  it("the last frame equals simulate() of the whole program (parity-safe)", () => {
    const ops = [
      { gate: "H", target: 0 },
      { gate: "RY", target: 1, theta: 0.7 },
      { gate: "CNOT", control: 0, target: 1 },
    ];
    const last = simulateSteps(ops, 2).at(-1)!;
    const direct = simulate(ops, 2);
    last.forEach((amp, i) => {
      expect(amp[0]).toBeCloseTo(direct[i][0], 12);
      expect(amp[1]).toBeCloseTo(direct[i][1], 12);
    });
  });

  it("each intermediate frame is the prefix circuit's state", () => {
    const ops = [
      { gate: "H", target: 0 },
      { gate: "CNOT", control: 0, target: 1 },
    ];
    const frames = simulateSteps(ops, 2);
    // After H on qubit 0 only: (|00> + |10>)/sqrt(2)
    expect(frames[1][0][0]).toBeCloseTo(Math.SQRT1_2, 12); // |00>
    expect(frames[1][2][0]).toBeCloseTo(Math.SQRT1_2, 12); // |10>
    expect(frames[1][3][0]).toBeCloseTo(0, 12); // |11> not yet populated
  });
});

describe("statesApproxEqual (up to global phase — used by the challenge grader)", () => {
  it("a state equals itself", () => {
    const a = simulate([{ gate: "H", target: 0 }], 1);
    expect(statesApproxEqual(a, a)).toBe(true);
  });

  it("states that differ only by a global phase are equal", () => {
    const a = simulate([{ gate: "H", target: 0 }], 1);
    const b: Complex[] = a.map(([re, im]) => [-im, re]); // multiply by i
    expect(statesApproxEqual(a, b)).toBe(true);
  });

  it("genuinely different states are not equal", () => {
    const a = simulate([{ gate: "H", target: 0 }], 1);
    const b = simulate([{ gate: "X", target: 0 }], 1);
    expect(statesApproxEqual(a, b)).toBe(false);
  });

  it("states of different dimension are not equal", () => {
    expect(statesApproxEqual(zeroState(1), zeroState(2))).toBe(false);
  });
});
