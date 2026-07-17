import {
  decodeShareHash,
  encodeShareHash,
  MAX_SHARE_NAME,
  MAX_SHARE_SRC,
  MAX_SHARE_THETA,
  sanitizeTheta,
} from "@/lib/circuit-url";

// Node's own base64url codec, used to cross-check the hand-rolled one and to
// forge payloads the encoder itself would never emit (wrong version, over-cap).
const forge = (obj: unknown): string =>
  `c=${Buffer.from(JSON.stringify(obj), "utf8").toString("base64url")}`;

describe("encodeShareHash / decodeShareHash round-trips", () => {
  it("round-trips a bare circuit (no name)", () => {
    const hash = encodeShareHash({ src: "H 0\nCNOT 0 1" });
    expect(decodeShareHash(hash)).toEqual({ src: "H 0\nCNOT 0 1" });
  });

  it("round-trips a named circuit", () => {
    const p = { name: "Bell pair", src: "H 0\nCNOT 0 1" };
    expect(decodeShareHash(encodeShareHash(p))).toEqual(p);
  });

  it("round-trips unicode in both name and src (comments carry prose)", () => {
    const p = { name: "ベル状態 — Bell", src: "# 量子もつれ 😀\nH 0\nCNOT 0 1" };
    expect(decodeShareHash(encodeShareHash(p))).toEqual(p);
  });

  it("an empty-string name encodes as nameless (mirrors the omit-on-undefined path)", () => {
    expect(decodeShareHash(encodeShareHash({ name: "", src: "H 0" }))).toEqual({ src: "H 0" });
  });

  it("round-trips theta alongside name and src", () => {
    const p = { name: "Ramsey", src: "H 0\nRZ 0 theta\nH 0", t: 2.5 };
    expect(decodeShareHash(encodeShareHash(p))).toEqual(p);
  });

  it("round-trips theta on a nameless circuit", () => {
    expect(decodeShareHash(encodeShareHash({ src: "RY 0 theta", t: 0.75 }))).toEqual({
      src: "RY 0 theta",
      t: 0.75,
    });
  });

  it("rounds theta to six decimals in the fragment (QASM's own angle precision)", () => {
    const decoded = decodeShareHash(encodeShareHash({ src: "RY 0 theta", t: Math.PI / 2 }));
    expect(decoded?.t).toBe(1.570796);
  });

  it("a payload without t decodes without one (old links keep the pi/2 default)", () => {
    expect(decodeShareHash(encodeShareHash({ src: "H 0" }))).toEqual({ src: "H 0" });
    expect(decodeShareHash(forge({ v: 1, src: "H 0" }))).toEqual({ src: "H 0" });
  });

  it("agrees with Node's base64url codec in both directions", () => {
    const p = { name: "café", src: "RY 0 theta" };
    // Our encoder's payload decodes with Buffer...
    const payload = encodeShareHash(p).slice(2);
    expect(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).toEqual({
      v: 1,
      ...p,
    });
    // ...and a Buffer-encoded payload decodes with our decoder.
    expect(decodeShareHash(forge({ v: 1, ...p }))).toEqual(p);
  });
});

describe("fragment ergonomics", () => {
  it("tolerates a leading '#'", () => {
    const hash = encodeShareHash({ src: "H 0" });
    expect(decodeShareHash(`#${hash}`)).toEqual({ src: "H 0" });
    expect(decodeShareHash(hash)).toEqual({ src: "H 0" }); // and its absence
  });

  it("finds c= among sibling fragment params", () => {
    const hash = encodeShareHash({ src: "H 0" });
    expect(decodeShareHash(`#x=1&${hash}`)).toEqual({ src: "H 0" });
    expect(decodeShareHash(`#${hash}&y=2`)).toEqual({ src: "H 0" });
    expect(decodeShareHash(`#a=b&${hash}&z=9`)).toEqual({ src: "H 0" });
  });

  it("does not match a param that merely ENDS in c (e.g. abc=...)", () => {
    const payload = encodeShareHash({ src: "H 0" }).slice(2);
    expect(decodeShareHash(`#abc=${payload}`)).toBeNull();
  });

  it("never emits '=' padding (fragments must survive copy-paste unescaped)", () => {
    // Payload lengths mod 3 = 0, 1, 2 exercise all base64 tail shapes.
    for (const src of ["H 0", "H 0\n", "H 0\nX 1", "a", "ab", "abc"]) {
      expect(encodeShareHash({ src })).toMatch(/^c=[A-Za-z0-9_-]+$/);
    }
  });
});

describe("hostile payloads decode to null, never a throw", () => {
  it.each([
    ["empty string", ""],
    ["bare hash", "#"],
    ["no c param", "#x=1&y=2"],
    ["empty c", "c="],
    ["non-base64url characters", "c=ey!!on"],
    ["not JSON after decode", `c=${Buffer.from("not json").toString("base64url")}`],
    ["JSON but not an object", `c=${Buffer.from("42").toString("base64url")}`],
    ["impossible base64url length (4k+1)", `c=${"A".repeat(5)}`],
  ])("%s -> null", (_label, hash) => {
    expect(decodeShareHash(hash)).toBeNull();
  });

  it("a truncated payload -> null", () => {
    const hash = encodeShareHash({ name: "Bell", src: "H 0\nCNOT 0 1" });
    expect(decodeShareHash(hash.slice(0, hash.length - 6))).toBeNull();
  });

  it("wrong or missing version -> null", () => {
    expect(decodeShareHash(forge({ v: 2, src: "H 0" }))).toBeNull();
    expect(decodeShareHash(forge({ src: "H 0" }))).toBeNull();
    expect(decodeShareHash(forge({ v: "1", src: "H 0" }))).toBeNull();
  });

  it("missing, empty, or non-string src -> null", () => {
    expect(decodeShareHash(forge({ v: 1 }))).toBeNull();
    expect(decodeShareHash(forge({ v: 1, src: "" }))).toBeNull();
    expect(decodeShareHash(forge({ v: 1, src: 7 }))).toBeNull();
  });

  it("src over the 4,000-char cap -> null (the whole payload is refused)", () => {
    expect(decodeShareHash(forge({ v: 1, src: "H".repeat(MAX_SHARE_SRC) }))).toEqual({
      src: "H".repeat(MAX_SHARE_SRC),
    });
    expect(decodeShareHash(forge({ v: 1, src: "H".repeat(MAX_SHARE_SRC + 1) }))).toBeNull();
  });

  it("an over-cap or non-string name is DROPPED but the circuit survives", () => {
    const src = "H 0";
    expect(decodeShareHash(forge({ v: 1, name: "n".repeat(MAX_SHARE_NAME), src }))).toEqual({
      name: "n".repeat(MAX_SHARE_NAME),
      src,
    });
    expect(decodeShareHash(forge({ v: 1, name: "n".repeat(MAX_SHARE_NAME + 1), src }))).toEqual({
      src,
    });
    expect(decodeShareHash(forge({ v: 1, name: 42, src }))).toEqual({ src });
  });

  it("a payload past the sanity cap is refused without decoding", () => {
    expect(decodeShareHash(`c=${"A".repeat(24_004)}`)).toBeNull();
  });

  it("a non-numeric or non-finite t is DROPPED but the circuit survives", () => {
    const src = "RY 0 theta";
    expect(decodeShareHash(forge({ v: 1, src, t: "1.57" }))).toEqual({ src });
    expect(decodeShareHash(forge({ v: 1, src, t: null }))).toEqual({ src });
    expect(decodeShareHash(forge({ v: 1, src, t: { rad: 1 } }))).toEqual({ src });
    // NaN/Infinity can't ride JSON as numbers (JSON.stringify emits null) — the
    // null branch above already covers what a forger can actually send; a raw
    // NaN token is invalid JSON and refuses the whole payload.
    expect(
      decodeShareHash(`c=${Buffer.from(`{"v":1,"src":"${src}","t":NaN}`).toString("base64url")}`),
    ).toBeNull();
  });

  it("an out-of-range t clamps to the slider's [0, 2*pi]", () => {
    const src = "RY 0 theta";
    expect(decodeShareHash(forge({ v: 1, src, t: -3 }))).toEqual({ src, t: 0 });
    expect(decodeShareHash(forge({ v: 1, src, t: 1e9 }))).toEqual({ src, t: MAX_SHARE_THETA });
  });
});

describe("sanitizeTheta (shared with the circuit store)", () => {
  it.each([
    ["a string", "1.5"],
    ["null", null],
    ["undefined", undefined],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["an object", { t: 1 }],
    ["a boolean", true],
  ])("%s is absent", (_label, value) => {
    expect(sanitizeTheta(value)).toBeUndefined();
  });

  it("passes in-range values through and clamps out-of-range ones", () => {
    expect(sanitizeTheta(0)).toBe(0);
    expect(sanitizeTheta(Math.PI)).toBe(Math.PI);
    expect(sanitizeTheta(MAX_SHARE_THETA)).toBe(MAX_SHARE_THETA);
    expect(sanitizeTheta(-0.01)).toBe(0);
    expect(sanitizeTheta(7)).toBe(MAX_SHARE_THETA);
  });
});
