import {
  blochTargetTruth,
  gradeBlochTarget,
  clampToleranceDeg,
  blochTargetReviewAnswer,
  MIN_TOLERANCE_DEG,
  MAX_TOLERANCE_DEG,
} from "@/lib/bloch-target-grade";
import { parseBlochTarget } from "@/lib/bloch-target-schema";
import { singleQubitState, simulate } from "@/components/quantum/math";

const DEG = Math.PI / 180;

function spec(program: string) {
  return parseBlochTarget(
    JSON.stringify({ id: "t", prompt: "p", target: { program } }),
  ).spec!;
}

describe("blochTargetTruth", () => {
  it("computes the target state for a concrete single-qubit circuit", () => {
    const { truth, error } = blochTargetTruth(spec("H 0"));
    expect(error).toBeUndefined();
    expect(truth!.targetState[0][0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(truth!.targetState[1][0]).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it("rejects an invalid target program", () => {
    expect(blochTargetTruth(spec("WOBBLE 0")).error).toMatch(/invalid/);
  });

  it("rejects a slider-bound theta (no single state to steer toward)", () => {
    expect(blochTargetTruth(spec("RY 0 theta")).error).toMatch(/concrete/);
  });

  it("rejects a multi-qubit target (the Bloch sphere shows one qubit)", () => {
    expect(blochTargetTruth(spec("H 0\nCNOT 0 1")).error).toMatch(/single-qubit/);
  });
});

describe("gradeBlochTarget", () => {
  const target = simulate([{ gate: "H", target: 0 }], 1); // |+> at theta=pi/2, phi=0

  it("solves an exact hit with zero distance", () => {
    const g = gradeBlochTarget(singleQubitState(Math.PI / 2, 0), target, 5 * DEG);
    expect(g.solved).toBe(true);
    expect(g.angleDeg).toBeCloseTo(0, 8);
  });

  it("solves a near miss inside the tolerance (one 3-degree slider step off)", () => {
    const g = gradeBlochTarget(singleQubitState(Math.PI / 2 + Math.PI / 60, 0), target, 5 * DEG);
    expect(g.angleDeg).toBeCloseTo(3, 6);
    expect(g.solved).toBe(true);
  });

  it("fails a miss outside the tolerance and reports the distance", () => {
    const g = gradeBlochTarget(singleQubitState(Math.PI / 2 + 6 * DEG, 0), target, 5 * DEG);
    expect(g.solved).toBe(false);
    expect(g.angleDeg).toBeCloseTo(6, 6);
  });

  it("solves exactly on the boundary (deterministic against acos rounding)", () => {
    const g = gradeBlochTarget(singleQubitState(Math.PI / 2 + 5 * DEG, 0), target, 5 * DEG);
    expect(g.solved).toBe(true);
  });

  it("is global-phase invariant (grades geometry, not amplitudes)", () => {
    // -|+> = e^{i pi}|+> — the same Bloch point.
    const phased = target.map(([re, im]) => [-re, -im] as [number, number]);
    const g = gradeBlochTarget(singleQubitState(Math.PI / 2, 0), phased, 5 * DEG);
    expect(g.solved).toBe(true);
  });

  it("grades the full sphere: |0> vs |1> is 180 degrees", () => {
    const g = gradeBlochTarget(
      singleQubitState(0, 0),
      simulate([{ gate: "X", target: 0 }], 1),
      5 * DEG,
    );
    expect(g.angleDeg).toBeCloseTo(180, 6);
    expect(g.solved).toBe(false);
  });
});

describe("clampToleranceDeg", () => {
  it("keeps an in-range tolerance", () => {
    expect(clampToleranceDeg(5)).toBe(5);
  });

  it("floors below one slider step of arc, so an on-grid target is always reachable", () => {
    expect(clampToleranceDeg(1)).toBe(MIN_TOLERANCE_DEG);
    expect(MIN_TOLERANCE_DEG).toBeGreaterThan(3); // the pi/60 slider step is 3 degrees
  });

  it("caps at the ceiling", () => {
    expect(clampToleranceDeg(90)).toBe(MAX_TOLERANCE_DEG);
  });
});

describe("blochTargetReviewAnswer", () => {
  it("names the target state as a Dirac string", () => {
    const { truth } = blochTargetTruth(spec("H 0"));
    expect(blochTargetReviewAnswer(truth!.targetState)).toMatch(/^Target state: /);
    expect(blochTargetReviewAnswer(truth!.targetState)).toContain("|0⟩");
    expect(blochTargetReviewAnswer(truth!.targetState)).toContain("|1⟩");
  });
});
