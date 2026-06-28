import {
  formatFixed,
  formatHartree,
  hartreeSR,
  formatAngstrom,
  angstromSR,
  formatRadians,
  formatPercent,
  percentSR,
} from "../../../src/components/quantum/format";

describe("formatFixed", () => {
  it("snaps -0 to 0", () => expect(formatFixed(-0, 3)).toBe("0.000"));
  it("snaps sub-epsilon negative to 0", () => expect(formatFixed(-1e-9, 4)).toBe("0.0000"));
  it("formats normal negative", () => expect(formatFixed(-1.13726, 4)).toBe("-1.1373"));
  it("formats positive", () => expect(formatFixed(1.5, 2)).toBe("1.50"));
});

describe("formatHartree", () => {
  it("appends Ha unit", () => expect(formatHartree(-1.1)).toBe("-1.1000 Ha"));
  it("uses custom digits", () => expect(formatHartree(-1.1, 2)).toBe("-1.10 Ha"));
});

describe("hartreeSR", () => {
  it("appends hartree unit", () => expect(hartreeSR(-1.1)).toBe("-1.1000 hartree"));
});

describe("formatAngstrom", () => {
  it("appends Å", () => expect(formatAngstrom(0.74)).toContain("Å"));
});

describe("angstromSR", () => {
  it("appends angstrom", () => expect(angstromSR(0.74)).toBe("0.74 angstrom"));
});

describe("formatRadians", () => {
  it("appends rad", () => expect(formatRadians(0.4)).toBe("0.40 rad"));
  it("snaps -0 near zero", () => expect(formatRadians(0)).toBe("0.00 rad"));
});

describe("formatPercent", () => {
  it("takes an already-scaled percentage and appends %", () =>
    expect(formatPercent(42.5)).toBe("42.5%"));
  it("defaults to 1 digit, identical to a bare toFixed for non-negative", () =>
    expect(formatPercent(7.5 * 100, 1)).toBe((7.5 * 100).toFixed(1) + "%"));
  it("honors custom digit counts", () => expect(formatPercent(99.6, 0)).toBe("100%"));
  it("snaps a noisy negative-zero to 0, not -0.0%", () =>
    expect(formatPercent(-1e-9)).toBe("0.0%"));
});

describe("percentSR", () => {
  it("spells out the unit for screen readers", () =>
    expect(percentSR(80)).toBe("80.0 percent"));
  it("honors custom digit counts and snaps -0", () =>
    expect(percentSR(-0, 0)).toBe("0 percent"));
});
