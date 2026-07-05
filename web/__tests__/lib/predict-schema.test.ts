import { parsePredict } from "@/lib/predict-schema";

describe("parsePredict", () => {
  it("parses a valid spec and defaults mode to top-outcome", () => {
    const { spec, error } = parsePredict(
      JSON.stringify({ id: "a", prompt: "p", program: "H 0" }),
    );
    expect(error).toBeUndefined();
    expect(spec).toMatchObject({ id: "a", prompt: "p", program: "H 0", mode: "top-outcome" });
  });

  it("accepts nonzero-states mode and an optional hint", () => {
    const { spec } = parsePredict(
      JSON.stringify({ id: "a", prompt: "p", program: "H 0", mode: "nonzero-states", hint: "h" }),
    );
    expect(spec!.mode).toBe("nonzero-states");
    expect(spec!.hint).toBe("h");
  });

  it("requires a non-empty id (the stable storage key)", () => {
    expect(parsePredict(JSON.stringify({ prompt: "p", program: "H 0" })).error).toMatch(/id/);
    expect(parsePredict(JSON.stringify({ id: "  ", prompt: "p", program: "H 0" })).error).toMatch(/id/);
  });

  it("requires prompt and program", () => {
    expect(parsePredict(JSON.stringify({ id: "a", program: "H 0" })).error).toMatch(/prompt/);
    expect(parsePredict(JSON.stringify({ id: "a", prompt: "p" })).error).toMatch(/program/);
  });

  it("rejects an unknown mode", () => {
    expect(
      parsePredict(JSON.stringify({ id: "a", prompt: "p", program: "H 0", mode: "foo" })).error,
    ).toMatch(/mode/);
  });

  it("reports invalid JSON", () => {
    expect(parsePredict("{ not json").error).toMatch(/invalid predict JSON/);
  });
});
