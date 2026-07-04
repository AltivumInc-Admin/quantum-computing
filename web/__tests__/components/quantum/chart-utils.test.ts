import {
  extent,
  linearScale,
  linePath,
  polylinePoints,
  plotInner,
  type Plot,
} from "@/components/quantum/chart-utils";

describe("extent", () => {
  it("finds min and max in one pass", () =>
    expect(extent([3, -2, 7, 0])).toEqual({ min: -2, max: 7 }));
  it("handles a single element", () => expect(extent([5])).toEqual({ min: 5, max: 5 }));
  it("handles all-negative values", () =>
    expect(extent([-3, -9, -1])).toEqual({ min: -9, max: -1 }));
  it("throws on an empty array (caller bug, fail loud)", () =>
    expect(() => extent([])).toThrow(/non-empty/));
});

describe("linearScale", () => {
  it("maps domain endpoints to range endpoints", () => {
    const s = linearScale(0, 10, 100, 200);
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(200);
    expect(s(5)).toBe(150);
  });
  it("supports an inverted domain (energy charts pass HIGH as d0)", () => {
    const s = linearScale(1, -1, 0, 100);
    expect(s(1)).toBe(0);
    expect(s(-1)).toBe(100);
    expect(s(0)).toBe(50);
  });
  it("supports an inverted range", () => {
    const s = linearScale(0, 1, 90, 0);
    expect(s(0)).toBe(90);
    expect(s(1)).toBe(0);
  });
  it("is float-identical to the inverted-domain energy-axis formula", () => {
    // The flipped y-axis rests on IEEE sign-symmetry: (v-yHi)/(yLo-yHi) must be
    // bit-identical to (yHi-v)/(yHi-yLo). Pins linearScale against a rewrite
    // (e.g. lerp form r0 + t*r1 - t*r0) that would flip low bits.
    const [yLo, yHi, padT, innerH] = [-1.1512, -0.8237, 12, 160];
    const s = linearScale(yHi, yLo, padT, padT + innerH);
    for (const v of [-1.1512, -1.0731, -0.98765432101, -0.8237]) {
      expect(s(v)).toBe(padT + ((yHi - v) / (yHi - yLo)) * innerH);
    }
  });

  it("is float-identical to the charts' ratio-then-multiply formula", () => {
    // The adoption contract: pad + ((v - lo) / (hi - lo)) * inner, bit for bit.
    const [lo, hi, pad, inner] = [0.3717, 2.9613, 40, 264];
    const s = linearScale(lo, hi, pad, pad + inner);
    for (const v of [0.3717, 0.74, 1.234567, 2.5, 2.9613]) {
      expect(s(v)).toBe(pad + ((v - lo) / (hi - lo)) * inner);
    }
  });
});

describe("linePath", () => {
  it("builds an M/L path at the default 2 digits", () =>
    expect(
      linePath([
        { x: 1.005, y: 2 },
        { x: 3.14159, y: 4.5 },
      ])
    ).toBe("M1.00,2.00 L3.14,4.50"));
  it("honors a custom digit count", () =>
    expect(linePath([{ x: 1.25, y: 2.35 }], 1)).toBe("M1.3,2.4"));
  it("renders a single point as a bare M command", () =>
    expect(linePath([{ x: 1, y: 2 }])).toBe("M1.00,2.00"));
  it("yields an empty string for an empty series (load-bearing: metrics' pre-stream guard)", () =>
    expect(linePath([])).toBe(""));
});

describe("polylinePoints", () => {
  it("builds a space-joined points string at the default 1 digit", () =>
    expect(
      polylinePoints([
        { x: 40.04, y: 152.96 },
        { x: 84.6, y: 60.12 },
      ])
    ).toBe("40.0,153.0 84.6,60.1"));
  it("yields an empty string for an empty series", () => expect(polylinePoints([])).toBe(""));
});

describe("plotInner", () => {
  it("subtracts the per-side padding", () => {
    const p: Plot = { w: 320, h: 200, padL: 40, padR: 16, padT: 16, padB: 32 };
    expect(plotInner(p)).toEqual({ innerW: 264, innerH: 152 });
  });
});
