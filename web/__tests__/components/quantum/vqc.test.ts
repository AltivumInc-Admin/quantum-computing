import { expectZ0, vqcOutput, paramShiftGrad, mseLoss, trainStep, makeBlobs, N_PARAMS } from "@/components/quantum/vqc";
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
});
