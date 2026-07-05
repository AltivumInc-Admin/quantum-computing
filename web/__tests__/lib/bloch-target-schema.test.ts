import { parseBlochTarget, DEFAULT_TOLERANCE_DEG } from "@/lib/bloch-target-schema";

const valid = {
  id: "t-plus",
  prompt: "Drive the vector to |+>.",
  target: { program: "H 0" },
};

describe("parseBlochTarget", () => {
  it("parses a minimal valid spec with defaults", () => {
    const { spec, error } = parseBlochTarget(JSON.stringify(valid));
    expect(error).toBeUndefined();
    expect(spec).toEqual({
      id: "t-plus",
      prompt: "Drive the vector to |+>.",
      target: { program: "H 0" },
      toleranceDeg: DEFAULT_TOLERANCE_DEG,
      hint: undefined,
      blind: false,
    });
  });

  it("carries an explicit tolerance, hint, and blind flag", () => {
    const { spec } = parseBlochTarget(
      JSON.stringify({ ...valid, toleranceDeg: 8, hint: "equator", blind: true }),
    );
    expect(spec!.toleranceDeg).toBe(8);
    expect(spec!.hint).toBe("equator");
    expect(spec!.blind).toBe(true);
  });

  it("rejects a mistyped blind loudly instead of silently handing the ghost back", () => {
    expect(parseBlochTarget(JSON.stringify({ ...valid, blind: "true" })).error).toMatch(/"blind"/);
    expect(parseBlochTarget(JSON.stringify({ ...valid, blind: 1 })).error).toMatch(/"blind"/);
  });

  it("rejects invalid JSON", () => {
    expect(parseBlochTarget("{nope").error).toMatch(/invalid bloch-target JSON/);
  });

  it("requires a non-empty id (the stable storage key)", () => {
    expect(parseBlochTarget(JSON.stringify({ ...valid, id: undefined })).error).toMatch(/"id"/);
    expect(parseBlochTarget(JSON.stringify({ ...valid, id: "  " })).error).toMatch(/"id"/);
  });

  it("requires a non-empty prompt", () => {
    expect(parseBlochTarget(JSON.stringify({ ...valid, prompt: "" })).error).toMatch(/"prompt"/);
  });

  it("requires target.program", () => {
    expect(parseBlochTarget(JSON.stringify({ ...valid, target: {} })).error).toMatch(/target/);
    expect(parseBlochTarget(JSON.stringify({ ...valid, target: undefined })).error).toMatch(/target/);
  });

  it("rejects a mistyped toleranceDeg loudly instead of silently defaulting", () => {
    expect(parseBlochTarget(JSON.stringify({ ...valid, toleranceDeg: "5" })).error).toMatch(
      /toleranceDeg/,
    );
  });
});
