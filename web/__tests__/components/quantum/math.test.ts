import { readFileSync } from "fs";
import path from "path";
import {
  type Gate2,
  I,
  X,
  Y,
  Z,
  H,
  S,
  T,
  rx,
  ry,
  rz,
  probabilities,
  blochVector,
  blochAngle,
  singleQubitState,
  simulate,
  basisLabel,
  statesApproxEqual,
  type Complex,
} from "@/components/quantum/math";

// Load the fixtures generated from qcsim (single source of truth for the gate
// matrices). Read via fs so the test does not depend on resolveJsonModule.
const FIXTURES = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../../src/components/quantum/__fixtures__/gates.json"),
    "utf-8"
  )
) as {
  gates: Record<string, number[][][]>;
  rotations: Record<string, Record<string, number[][][]>>;
};

function expectGateMatchesFixture(name: string, gate: Gate2) {
  const fixture = FIXTURES.gates[name];
  expect(fixture).toBeDefined();
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      expect(gate[r][c][0]).toBeCloseTo(fixture[r][c][0], 10);
      expect(gate[r][c][1]).toBeCloseTo(fixture[r][c][1], 10);
    }
  }
}

describe("quantum/math gate matrices match qcsim fixtures", () => {
  it.each([
    ["I", I],
    ["X", X],
    ["Y", Y],
    ["Z", Z],
    ["H", H],
    ["S", S],
    ["T", T],
  ])("%s matches the qcsim-generated matrix to 1e-10", (name, gate) => {
    expectGateMatchesFixture(name, gate as Gate2);
  });
});

describe("quantum/math rotation matrices match qcsim fixtures", () => {
  const builders = { rx, ry, rz } as const;
  // Keys + thetas mirror scripts that generated FIXTURES.rotations (same IEEE doubles).
  const angles: Array<[string, number]> = [
    ["0", 0],
    ["pi_4", Math.PI / 4],
    ["pi_3", Math.PI / 3],
    ["pi_2", Math.PI / 2],
    ["t0_9", 0.9],
    ["pi", Math.PI],
  ];
  const cases = (["rx", "ry", "rz"] as const).flatMap((g) =>
    angles.map(([key, theta]) => [g, key, theta] as [keyof typeof builders, string, number])
  );
  it.each(cases)("%s(%s) matches the qcsim-generated matrix to 1e-10", (g, key, theta) => {
    const gate = builders[g](theta);
    const fixture = FIXTURES.rotations[g][key];
    expect(fixture).toBeDefined();
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        expect(gate[r][c][0]).toBeCloseTo(fixture[r][c][0], 10);
        expect(gate[r][c][1]).toBeCloseTo(fixture[r][c][1], 10);
      }
    }
  });
});

describe("quantum/math state evolution", () => {
  it("H|0> produces the equal superposition", () => {
    const state = simulate([{ gate: "H", target: 0 }], 1);
    expect(state[0][0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(state[1][0]).toBeCloseTo(Math.SQRT1_2, 10);
    const p = probabilities(state);
    expect(p[0]).toBeCloseTo(0.5, 10);
    expect(p[1]).toBeCloseTo(0.5, 10);
  });

  it("X|0> = |1>", () => {
    const state = simulate([{ gate: "X", target: 0 }], 1);
    expect(probabilities(state)).toEqual([expect.closeTo(0, 10), expect.closeTo(1, 10)]);
  });

  it("Ry(pi)|0> = |1>", () => {
    const state = simulate([{ gate: "RY", target: 0, theta: Math.PI }], 1);
    const p = probabilities(state);
    expect(p[1]).toBeCloseTo(1, 10);
  });

  it("H then CNOT yields the Bell state (|00> + |11>)/sqrt(2)", () => {
    const state = simulate(
      [
        { gate: "H", target: 0 },
        { gate: "CNOT", control: 0, target: 1 },
      ],
      2
    );
    const p = probabilities(state);
    expect(p[0]).toBeCloseTo(0.5, 10); // |00>
    expect(p[1]).toBeCloseTo(0, 10); // |01>
    expect(p[2]).toBeCloseTo(0, 10); // |10>
    expect(p[3]).toBeCloseTo(0.5, 10); // |11>
  });

  it("probabilities always sum to 1 (norm preserved)", () => {
    const state = simulate(
      [
        { gate: "H", target: 0 },
        { gate: "RY", target: 1, theta: 0.9 },
        { gate: "CNOT", control: 0, target: 1 },
      ],
      2
    );
    const total = probabilities(state).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("quantum/math derived quantities", () => {
  it("Bloch vector of |0> points to the north pole", () => {
    const v = blochVector(simulate([], 1));
    expect(v).toEqual({
      x: expect.closeTo(0, 10),
      y: expect.closeTo(0, 10),
      z: expect.closeTo(1, 10),
    });
  });

  it("Bloch vector of |+> points along +x", () => {
    const v = blochVector(simulate([{ gate: "H", target: 0 }], 1));
    expect(v.x).toBeCloseTo(1, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it("basisLabel is big-endian (qubit 0 leftmost)", () => {
    expect(basisLabel(2, 2)).toBe("10");
    expect(basisLabel(1, 3)).toBe("001");
  });
});

describe("quantum/math blochAngle", () => {
  const zero = simulate([], 1); // |0>
  const one = simulate([{ gate: "X", target: 0 }], 1); // |1>
  const plus = simulate([{ gate: "H", target: 0 }], 1); // |+>

  it("is zero between identical states", () => {
    expect(blochAngle(plus, plus)).toBeCloseTo(0, 10);
  });

  it("is pi between antipodal states |0> and |1>", () => {
    expect(blochAngle(zero, one)).toBeCloseTo(Math.PI, 10);
  });

  it("is pi/2 between |0> and |+>", () => {
    expect(blochAngle(zero, plus)).toBeCloseTo(Math.PI / 2, 10);
  });

  it("is invariant under a global phase on either argument", () => {
    // e^{i*0.7} |+> — physically the same point on the sphere.
    const c = Math.cos(0.7);
    const s = Math.sin(0.7);
    const phased = plus.map(([re, im]) => [re * c - im * s, re * s + im * c] as [number, number]);
    expect(blochAngle(zero, phased)).toBeCloseTo(blochAngle(zero, plus), 10);
    expect(blochAngle(phased, plus)).toBeCloseTo(0, 10);
  });

  it("matches the slider parameterization: theta IS the polar angle from |0>", () => {
    for (const theta of [0.3, 1.1, 2.5]) {
      expect(blochAngle(zero, singleQubitState(theta, 0.9))).toBeCloseTo(theta, 10);
    }
  });

  it("never returns NaN when float drift pushes the dot product past 1", () => {
    // Two H-applications reconstruct |0> with ~1e-16 drift; dot may exceed 1.
    const roundTrip = simulate([{ gate: "H", target: 0 }, { gate: "H", target: 0 }], 1);
    expect(Number.isNaN(blochAngle(zero, roundTrip))).toBe(false);
    expect(blochAngle(zero, roundTrip)).toBeCloseTo(0, 6);
  });
});

describe("statesApproxEqual rejects non-finite amplitudes", () => {
  const bell: Complex[] = [
    [Math.SQRT1_2, 0],
    [0, 0],
    [0, 0],
    [Math.SQRT1_2, 0],
  ];

  it("does not report an all-NaN vector as equal to a real target", () => {
    // Every `Math.abs(NaN - x) > eps` is false, so without an explicit guard
    // this vector falls straight through the comparison loop and returns true —
    // a silent false pass in every grader riding this kernel. Reachable from a
    // learner circuit: Circuit().ry(0, np.arcsin(2.0)).
    const allNaN: Complex[] = bell.map(() => [NaN, NaN] as Complex);
    expect(statesApproxEqual(allNaN, bell)).toBe(false);
    expect(statesApproxEqual(bell, allNaN)).toBe(false);
  });

  it("rejects Infinity, which JSON can carry in via 1e400", () => {
    const inf: Complex[] = bell.map(() => [Infinity, 0] as Complex);
    expect(statesApproxEqual(inf, bell)).toBe(false);
  });

  it("rejects a single non-finite component among finite ones", () => {
    const one: Complex[] = bell.map((c) => [c[0], c[1]] as Complex);
    one[2] = [NaN, 0];
    expect(statesApproxEqual(one, bell)).toBe(false);
  });

  it("still accepts a genuine match up to global phase", () => {
    const phased = bell.map(([re, im]) => [-re, -im] as Complex);
    expect(statesApproxEqual(phased, bell)).toBe(true);
  });
});
