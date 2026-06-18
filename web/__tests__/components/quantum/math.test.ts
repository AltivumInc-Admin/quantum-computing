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
  simulate,
  basisLabel,
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
