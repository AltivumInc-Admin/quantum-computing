import { readFileSync } from "fs";
import path from "path";
import { ry, zeroState, applyGate1 } from "@/components/quantum/math";
import {
  type H2Curve,
  pauliExpectation,
  hamiltonianExpectation,
  energy1q,
  oneQubitHamiltonian,
  eighSymmetric,
  exactGround,
  vqeGridSearch,
  vqeGradientDescent,
  loadH2Curve,
  h2OneQubit,
  h2Energies,
  oneQubitGroundEnergy,
  jwHamiltonian,
} from "@/components/quantum/chemistry";

const CURVE = loadH2Curve(
  JSON.parse(
    readFileSync(
      path.join(__dirname, "../../../src/components/quantum/__fixtures__/h2_dissociation.json"),
      "utf-8"
    )
  )
) as H2Curve;

// RY(theta)|0> = cos(theta/2)|0> + sin(theta/2)|1>
const ryState = (theta: number) => applyGate1(zeroState(1), ry(theta), 0, 1);

describe("pauliExpectation (endianness + Pauli sanity)", () => {
  it("<Z> on RY(theta)|0> = cos(theta), <X> = sin(theta), <Y> = 0", () => {
    for (const theta of [0, 0.4, 1.0, 2.3, -1.1]) {
      const s = ryState(theta);
      expect(pauliExpectation(s, "Z")).toBeCloseTo(Math.cos(theta), 9);
      expect(pauliExpectation(s, "X")).toBeCloseTo(Math.sin(theta), 9);
      expect(pauliExpectation(s, "Y")).toBeCloseTo(0, 9);
    }
  });
  it("<I> = 1 for a normalized state; <Z>|0> = +1, <Z>(X|0>) = -1", () => {
    expect(pauliExpectation(ryState(0.7), "I")).toBeCloseTo(1, 12);
    expect(pauliExpectation(zeroState(1), "Z")).toBeCloseTo(1, 12);
    expect(pauliExpectation(ryState(Math.PI), "Z")).toBeCloseTo(-1, 9);
  });
});

describe("energy1q", () => {
  it("matches the generic Pauli path for H = c0 I + cz Z + cx X", () => {
    const [c0, cz, cx] = [-0.32872, 0.78797, 0.18129];
    const H = oneQubitHamiltonian(c0, cz, cx);
    for (const theta of [0, 0.5, 1.7, -2.0]) {
      expect(energy1q(c0, cz, cx, theta)).toBeCloseTo(
        hamiltonianExpectation(ryState(theta), H),
        9
      );
    }
  });
  it("minimum equals c0 - hypot(cz, cx) at theta* = atan2(-cx, -cz)", () => {
    const [c0, cz, cx] = [-0.32872, 0.78797, 0.18129];
    const star = Math.atan2(-cx, -cz);
    const min = energy1q(c0, cz, cx, star);
    expect(min).toBeCloseTo(c0 - Math.hypot(cz, cx), 12);
    expect(vqeGridSearch(oneQubitHamiltonian(c0, cz, cx), 4000).energy).toBeCloseTo(min, 4);
  });
});

describe("eighSymmetric + exactGround", () => {
  it("diagonal matrix returns sorted diagonal", () => {
    const { values } = eighSymmetric([
      [3, 0, 0],
      [0, -1, 0],
      [0, 0, 2],
    ]);
    expect(values).toEqual([-1, 2, 3]);
  });
  it("reconstructs a random 4x4 symmetric matrix: V diag(l) V^T ~= M", () => {
    const m = [
      [2, -1, 0.5, 0.2],
      [-1, 1, 0.3, -0.4],
      [0.5, 0.3, -2, 0.1],
      [0.2, -0.4, 0.1, 0.7],
    ];
    const { values, vectors } = eighSymmetric(m);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        let acc = 0;
        for (let k = 0; k < 4; k++) acc += vectors[k][i] * values[k] * vectors[k][j];
        expect(acc).toBeCloseTo(m[i][j], 8);
      }
  });
  it("ground energy of c0 I + cz Z + cx X = c0 - hypot(cz, cx)", () => {
    const [c0, cz, cx] = [-0.3, 0.8, 0.18];
    expect(exactGround(oneQubitHamiltonian(c0, cz, cx)).energy).toBeCloseTo(
      c0 - Math.hypot(cz, cx),
      10
    );
  });
});

describe("VQE optimizer", () => {
  it("gradient descent drives energy down to the exact ground state", () => {
    const H = oneQubitHamiltonian(-0.32872, 0.78797, 0.18129);
    const exact = exactGround(H).energy;
    const { energy, history } = vqeGradientDescent(H, [0.1], 0.3, 200);
    expect(energy).toBeCloseTo(exact, 3);
    // history is (weakly) non-increasing
    for (let i = 1; i < history.length; i++) expect(history[i]).toBeLessThanOrEqual(history[i - 1] + 1e-9);
  });
});

describe("H2 fixture (the source of truth)", () => {
  it("loads with strictly increasing R and full jw rows", () => {
    expect(CURVE.basis).toBe("sto-3g");
    expect(CURVE.jwTerms).toHaveLength(15);
    expect(CURVE.points.length).toBeGreaterThan(40);
  });
  it("rejects a malformed fixture (missing cx)", () => {
    expect(() =>
      loadH2Curve({ basis: "sto-3g", jwTerms: ["I"], points: [{ R: 0.5, c0: 0, cz: 0, fci: 0, hf: 0, jw: [0] }] })
    ).toThrow();
  });
  it("rejects a point with Infinity (non-finite)", () => {
    expect(() =>
      loadH2Curve({ basis: "sto-3g", jwTerms: ["I"], points: [{ R: Infinity, c0: 0, cz: 0, cx: 0, fci: 0, hf: 0, jw: [0] }] })
    ).toThrow(/non-finite/i);
  });
  it("tapered E0 = c0 - hypot(cz, cx) = FCI at every R", () => {
    for (const p of CURVE.points) {
      expect(p.c0 - Math.hypot(p.cz, p.cx)).toBeCloseTo(p.fci, 5);
    }
  });
  it("exactGround of the 15-term JW Hamiltonian = FCI at every R", () => {
    for (const p of CURVE.points) {
      const H = jwHamiltonian(CURVE.jwTerms, p.jw);
      expect(exactGround(H).energy).toBeCloseTo(p.fci, 5);
    }
  });
  it("variational bound holds: HF >= FCI at every R", () => {
    for (const p of CURVE.points) expect(p.hf).toBeGreaterThanOrEqual(p.fci - 1e-9);
  });
  it("equilibrium ground energy is -1.1373 Ha (STO-3G H2)", () => {
    const eqm = CURVE.points.reduce((a, b) => (b.fci < a.fci ? b : a));
    expect(eqm.fci).toBeCloseTo(-1.1373, 3);
    expect(eqm.R).toBeCloseTo(0.74, 1);
  });
  // The `equilibrium` block is what qpes prints as four teaching facts, what it
  // draws its amber marker from, and what qham/qvqe open on — but it used to be
  // the one declared field loadH2Curve never read, so a regen on a different
  // grid could move the curve's minimum and leave the block (and every number
  // derived from it) silently stale.
  describe("equilibrium block", () => {
    const base = {
      molecule: "H2",
      basis: "sto-3g",
      provenance: "test fixture",
      jwTerms: ["I"],
      points: [
        { R: 0.5, c0: 0, cz: 1, cx: 0, fci: -1, hf: -0.9, jw: [1] },
        { R: 0.6, c0: 0, cz: 1, cx: 0, fci: -2, hf: -1.9, jw: [1] },
      ],
    };

    it("the committed fixture's equilibrium IS the argmin of its own points", () => {
      const argmin = CURVE.points.reduce((a, b) => (b.fci < a.fci ? b : a));
      expect(CURVE.equilibrium.R).toBe(argmin.R);
      expect(CURVE.equilibrium.fci).toBeCloseTo(argmin.fci, 6);
      expect(CURVE.equilibrium.hf).toBeCloseTo(argmin.hf, 6);
    });

    it("accepts a fixture whose equilibrium is the sampled minimum", () => {
      expect(() =>
        loadH2Curve({ ...base, equilibrium: { R: 0.6, fci: -2, hf: -1.9 } })
      ).not.toThrow();
    });

    it("rejects an equilibrium that is not the sampled minimum", () => {
      expect(() =>
        loadH2Curve({ ...base, equilibrium: { R: 0.5, fci: -1, hf: -0.9 } })
      ).toThrow(/sampled minimum/i);
    });

    it("rejects a missing equilibrium block", () => {
      expect(() => loadH2Curve(base)).toThrow(/equilibrium/i);
    });

    it("rejects a fixture missing molecule/provenance (qham renders both)", () => {
      const noMolecule: Record<string, unknown> = {
        ...base,
        equilibrium: { R: 0.6, fci: -2, hf: -1.9 },
      };
      delete noMolecule.molecule;
      expect(() => loadH2Curve(noMolecule)).toThrow(/molecule\/provenance/i);
    });
  });

  it("interpolates (c0,cz,cx) between grid points", () => {
    const lo = CURVE.points[10];
    const hi = CURVE.points[11];
    const mid = h2OneQubit((lo.R + hi.R) / 2, CURVE.points);
    expect(mid.c0).toBeCloseTo((lo.c0 + hi.c0) / 2, 6);
  });
});

describe("oneQubitGroundEnergy", () => {
  it("matches exactGround for tapered single-qubit H", () => {
    for (const p of [CURVE.points[5], CURVE.points[20]]) {
      const exact = exactGround(oneQubitHamiltonian(p.c0, p.cz, p.cx)).energy;
      expect(oneQubitGroundEnergy(p.c0, p.cz, p.cx)).toBeCloseTo(exact, 9);
    }
  });
});

describe("h2Energies", () => {
  it("interpolates FCI and HF between grid points", () => {
    const lo = CURVE.points[10];
    const hi = CURVE.points[11];
    const mid = h2Energies((lo.R + hi.R) / 2, CURVE.points);
    expect(mid.fci).toBeCloseTo((lo.fci + hi.fci) / 2, 6);
    expect(mid.hf).toBeCloseTo((lo.hf + hi.hf) / 2, 6);
  });
  it("clamps at endpoints", () => {
    const first = CURVE.points[0];
    const last = CURVE.points[CURVE.points.length - 1];
    expect(h2Energies(first.R - 1, CURVE.points).fci).toBe(first.fci);
    expect(h2Energies(last.R + 1, CURVE.points).fci).toBe(last.fci);
  });
});
