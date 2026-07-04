import {
  clamp,
  clampInt,
  parseJsonObject,
  readNumber,
  parseIndex,
  parseAngle,
} from "@/components/quantum/parse-utils";

describe("clamp", () => {
  it("clamps above max", () => expect(clamp(5, 0, 3)).toBe(3));
  it("clamps below min", () => expect(clamp(-1, 0, 3)).toBe(0));
  it("passes through in-range", () => expect(clamp(2, 0, 3)).toBe(2));
});

describe("clampInt", () => {
  it("rounds and clamps", () => expect(clampInt(2.6, 0, 10)).toBe(3));
  it("returns lo for NaN", () => expect(clampInt(NaN, 2, 9)).toBe(2));
  it("clamps above max", () => expect(clampInt(100, 0, 10)).toBe(10));
});

describe("parseJsonObject", () => {
  it("returns null obj for empty string", () => {
    expect(parseJsonObject("")).toEqual({ ok: true, obj: null });
  });

  it("returns null obj for whitespace", () => {
    expect(parseJsonObject("   ")).toEqual({ ok: true, obj: null });
  });

  it("returns error for invalid JSON", () => {
    const r = parseJsonObject("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid JSON");
  });

  it("rejects arrays", () => {
    const r = parseJsonObject("[1,2]");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("expected a JSON object");
  });

  it("rejects bare numbers", () => {
    const r = parseJsonObject("5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("expected a JSON object");
  });

  it("rejects null literal", () => {
    const r = parseJsonObject("null");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("expected a JSON object");
  });

  it("parses a valid object", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ ok: true, obj: { a: 1 } });
  });
});

describe("readNumber", () => {
  it("falls back when the key is missing", () =>
    expect(readNumber({}, "n", 7, 0, 10)).toEqual({ ok: true, value: 7 }));
  it("errors on a non-number value", () =>
    expect(readNumber({ n: "5" }, "n", 7, 0, 10)).toEqual({
      ok: false,
      error: '"n" must be a finite number',
    }));
  it("errors on Infinity (what JSON.parse makes of 1e999)", () =>
    expect(readNumber({ n: Infinity }, "n", 7, 0, 10)).toEqual({
      ok: false,
      error: '"n" must be a finite number',
    }));
  it("errors on NaN", () =>
    expect(readNumber({ n: NaN }, "n", 7, 0, 10).ok).toBe(false));
  it("clamps an in-type value into [lo, hi]", () =>
    expect(readNumber({ n: 42 }, "n", 7, 0, 10)).toEqual({ ok: true, value: 10 }));
});

describe("parseIndex", () => {
  it("rejects a sign (parseInt would accept '-1')", () => expect(parseIndex("-1").ok).toBe(false));
  it("rejects decimals", () => expect(parseIndex("1.5").ok).toBe(false));
  it("rejects trailing garbage (parseInt would truncate '0abc')", () =>
    expect(parseIndex("0abc").ok).toBe(false));
  it("rejects the empty string and undefined", () => {
    expect(parseIndex("").ok).toBe(false);
    expect(parseIndex(undefined).ok).toBe(false);
  });
  it("accepts leading zeros ('03' -> 3)", () =>
    expect(parseIndex("03")).toEqual({ ok: true, value: 3 }));
  it("accepts plain digits", () => expect(parseIndex("12")).toEqual({ ok: true, value: 12 }));
});

describe("parseAngle", () => {
  it("rejects the empty string and undefined", () => {
    expect(parseAngle("").ok).toBe(false);
    expect(parseAngle(undefined).ok).toBe(false);
  });
  it("rejects trailing garbage (parseFloat would truncate '1.5xyz')", () =>
    expect(parseAngle("1.5xyz").ok).toBe(false));
  it("rejects non-numeric tokens", () => expect(parseAngle("abc").ok).toBe(false));
  it("accepts negative angles", () =>
    expect(parseAngle("-0.5")).toEqual({ ok: true, value: -0.5 }));
  it("accepts exponent form", () => expect(parseAngle("1e-3")).toEqual({ ok: true, value: 0.001 }));
});
