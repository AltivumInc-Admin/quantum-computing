import {
  cutValue,
  landscapeAngles,
  landscapeCell,
  QAOA_DOMAIN,
  qaoaExpectedCut,
  qaoaDistribution,
  qaoaLandscape,
} from "@/components/quantum/qaoa";

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

  describe("landscape domain", () => {
    const RES = 24;

    it("landscapeCell round-trips landscapeAngles for every cell", () => {
      // The explorer places its current-point marker with landscapeCell and the
      // kernel evaluates the grid with landscapeAngles. Before they were one
      // source this invariant held only by coincidence, and nothing caught a
      // drift in either range.
      for (let gi = 0; gi < RES; gi++) {
        for (let bi = 0; bi < RES; bi++) {
          const { gamma, beta } = landscapeAngles(gi, bi, RES);
          expect(landscapeCell(gamma, beta, RES)).toEqual({ gi, bi });
        }
      }
    });

    it("the domain endpoints map to the first and last cell", () => {
      expect(landscapeCell(0, 0, RES)).toEqual({ gi: 0, bi: 0 });
      expect(landscapeCell(QAOA_DOMAIN.gammaMax, QAOA_DOMAIN.betaMax, RES)).toEqual({
        gi: RES - 1,
        bi: RES - 1,
      });
    });

    it("landscapeCell clamps angles outside the domain into the grid", () => {
      expect(landscapeCell(-1, -1, RES)).toEqual({ gi: 0, bi: 0 });
      expect(landscapeCell(10 * Math.PI, 10 * Math.PI, RES)).toEqual({
        gi: RES - 1,
        bi: RES - 1,
      });
    });

    it("qaoaLandscape indexes [gamma][beta], not the reverse", () => {
      // grid[gi][bi]: the OUTER index is gamma. Pinned because the explorer's
      // heatmap and its axis caption both depend on this orientation.
      const L = qaoaLandscape(3, TRIANGLE, RES);
      for (let gi = 0; gi < RES; gi++) {
        for (let bi = 0; bi < RES; bi++) {
          const { gamma, beta } = landscapeAngles(gi, bi, RES);
          expect(L[gi][bi]).toBeCloseTo(qaoaExpectedCut(3, TRIANGLE, gamma, beta), 10);
        }
      }
    });
  });
});
