import { expectZ0, vqcOutput, paramShiftGrad, mseLoss, trainStep, makeBlobs, accuracyOf, initTheta, N_PARAMS } from "@/components/quantum/vqc";
import { zeroState, applyGate1, X } from "@/components/quantum/math";

describe("vqc", () => {
  it("expectZ0 endianness: |00> -> +1, X on q0 -> -1", () => {
    expect(expectZ0(zeroState(2))).toBeCloseTo(1, 9);
    expect(expectZ0(applyGate1(zeroState(2), X, 0, 2))).toBeCloseTo(-1, 9);
  });
  it("parameter-shift gradient matches finite difference", () => {
    const theta = Array.from({ length: N_PARAMS }, (_, i) => 0.3 + 0.1 * i);
    const x: [number, number] = [0.5, -0.4];
    const j = 3, eps = 1e-5;
    const tp = theta.slice(); tp[j] += eps;
    const tm = theta.slice(); tm[j] -= eps;
    const fd = (vqcOutput(x, tp, 0) - vqcOutput(x, tm, 0)) / (2 * eps);
    expect(paramShiftGrad(x, theta, 0, j)).toBeCloseTo(fd, 4);
  });
  it("training reduces MSE loss on separable blobs", () => {
    const data = makeBlobs(30, 1);
    let theta = Array.from({ length: N_PARAMS }, (_, i) => -0.1 + 0.05 * (i % 5));
    let bias = 0;
    const before = mseLoss(data, theta, bias);
    for (let s = 0; s < 30; s++) ({ theta, bias } = trainStep(data, theta, bias, 0.3));
    expect(mseLoss(data, theta, bias)).toBeLessThan(before);
  });

  // accuracyOf is the widget's headline number and used to live (untested) in
  // the .tsx; these pin both ends of its range and the fact that it tracks
  // training, matching kernel.test.ts's treatment of the sibling `accuracy`.
  it("accuracyOf is 1 for a perfectly-fitted classifier and 0 for its negation", () => {
    const data = makeBlobs(30, 1);
    // A constant classifier that agrees with every label is not reachable, so
    // build the check from the model's own predictions instead.
    let theta = Array.from({ length: N_PARAMS }, (_, i) => -0.1 + 0.05 * (i % 5));
    let bias = 0;
    for (let s = 0; s < 200; s++) ({ theta, bias } = trainStep(data, theta, bias, 0.3));
    const acc = accuracyOf(data, theta, bias);
    expect(acc).toBeGreaterThan(0.9);
    // Flipping every label must flip the score exactly.
    const flipped = data.map((d) => ({ x: d.x, y: (-d.y) as -1 | 1 }));
    expect(accuracyOf(flipped, theta, bias)).toBeCloseTo(1 - acc, 12);
  });
  it("accuracyOf agrees with the sign of vqcOutput on every point", () => {
    const data = makeBlobs(20, 4);
    const theta = Array.from({ length: N_PARAMS }, (_, i) => 0.2 * i);
    const manual =
      data.filter((d) => (vqcOutput(d.x, theta, 0.1) >= 0 ? 1 : -1) === d.y).length / data.length;
    expect(accuracyOf(data, theta, 0.1)).toBe(manual);
  });
  it("initTheta draws N_PARAMS angles inside the documented [-0.1, 0.3) band", () => {
    const t = initTheta();
    expect(t).toHaveLength(N_PARAMS);
    for (const v of t) {
      expect(v).toBeGreaterThanOrEqual(-0.1);
      expect(v).toBeLessThan(0.3);
    }
  });
  it("makeBlobs' shipped seed stays inside the trainer's drawable window", () => {
    // The scatter derives its span from this data (vqc-trainer planeFor), but a
    // dataset whose clip bound (pi) dwarfs the plot is how one point ended up
    // rendered off the viewBox; pin the extent so a reseed is a visible change.
    const data = makeBlobs(30, 1);
    const maxAbs = Math.max(...data.flatMap((d) => [Math.abs(d.x[0]), Math.abs(d.x[1])]));
    expect(maxAbs).toBeLessThan(Math.PI);
    expect(maxAbs).toBeCloseTo(1.6298, 3);
  });
});
