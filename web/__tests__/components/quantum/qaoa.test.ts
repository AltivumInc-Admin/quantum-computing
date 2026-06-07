import { cutValue, qaoaExpectedCut, qaoaDistribution, qaoaLandscape } from "@/components/quantum/qaoa";

const TRIANGLE: [number, number][] = [[0, 1], [1, 2], [2, 0]];

describe("qaoa", () => {
  it("cutValue counts differing-endpoint edges", () => {
    expect(cutValue(0b000, TRIANGLE)).toBe(0); // all same
    expect(cutValue(0b111, TRIANGLE)).toBe(0); // all same
    expect(cutValue(0b001, TRIANGLE)).toBe(2); // one vertex split off
  });
  it("triangle max cut is 2 (no assignment cuts all 3 edges)", () => {
    let max = 0;
    for (let x = 0; x < 8; x++) max = Math.max(max, cutValue(x, TRIANGLE));
    expect(max).toBe(2);
  });
  it("gamma=beta=0 yields the mean cut over all assignments (= 1.5 for the triangle)", () => {
    expect(qaoaExpectedCut(3, TRIANGLE, 0, 0)).toBeCloseTo(1.5, 10);
  });
  it("distribution sums to 1", () => {
    const d = qaoaDistribution(3, TRIANGLE, 0.7, 0.3);
    expect(d.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
  });
  it("landscape is a res x res grid of finite numbers", () => {
    const L = qaoaLandscape(3, TRIANGLE, 8);
    expect(L).toHaveLength(8);
    expect(L[0]).toHaveLength(8);
    L.flat().forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});
