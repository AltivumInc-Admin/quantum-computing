import { kernelMatrix, kernelBias, kernelScore, makeDataset, accuracy } from "@/components/quantum/kernel";

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
});
