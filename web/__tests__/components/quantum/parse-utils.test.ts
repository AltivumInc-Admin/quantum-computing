import { clamp, clampInt, parseJsonObject } from "../../../src/components/quantum/parse-utils";

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
