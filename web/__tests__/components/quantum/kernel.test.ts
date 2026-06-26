import { kernelMatrix, kernelBias, kernelBiasS, kernelScore, kernelScoreS, featureState, makeDataset, accuracy } from "@/components/quantum/kernel";

describe("kernel", () => {
  it("kernel matrix is symmetric with unit diagonal in [0,1]", () => {
    const pts: [number, number][] = [[0.2, 0.3], [-0.4, 0.5], [0.1, -0.6]];
    const K = kernelMatrix(pts, "angle", 1);
    for (let i = 0; i < 3; i++) {
      expect(K[i][i]).toBeCloseTo(1, 9);
      for (let j = 0; j < 3; j++) {
        expect(K[i][j]).toBeCloseTo(K[j][i], 9);
        expect(K[i][j]).toBeGreaterThanOrEqual(-1e-9);
        expect(K[i][j]).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
  it("the quantum kernel beats a chance baseline on circles (seeded)", () => {
    const train = makeDataset("circles", 60, 1);
    const test = makeDataset("circles", 60, 2);
    const bias = kernelBias(train, "iqp", 1);
    const preds = test.map((p) => (kernelScore(p.x, train, "iqp", 1, bias) >= 0 ? 1 : -1));
    expect(accuracy(preds, test.map((p) => p.y))).toBeGreaterThan(0.7);
  });
  it("kernelBiasS matches kernelBias for the same inputs", () => {
    const train = makeDataset("circles", 60, 1);
    const trainStates = train.map((p) => featureState(p.x, "iqp", 1));
    expect(kernelBiasS(trainStates, train)).toBeCloseTo(kernelBias(train, "iqp", 1), 12);
  });
  it("kernelScore matches kernelScoreS (single shipped path)", () => {
    const train = makeDataset("xor", 12, 3);
    const states = train.map((p) => featureState(p.x, "angle", 1.3));
    const x: [number, number] = [0.2, -0.4];
    expect(kernelScore(x, train, "angle", 1.3, 0.1)).toBeCloseTo(
      kernelScoreS(x, states, train, "angle", 1.3, 0.1), 12
    );
  });
});
