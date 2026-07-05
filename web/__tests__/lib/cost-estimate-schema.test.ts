import { parseCostEstimate, MIN_SHOTS, MAX_SHOTS } from "@/lib/cost-estimate-schema";

const valid = {
  id: "t-cost",
  prompt: "Price one task of 2,000 shots on IonQ.",
  provider: "IonQ",
  shots: 2000,
};

describe("parseCostEstimate", () => {
  it("parses a minimal valid spec with tasks defaulting to 1", () => {
    const { spec, error } = parseCostEstimate(JSON.stringify(valid));
    expect(error).toBeUndefined();
    expect(spec).toEqual({
      id: "t-cost",
      prompt: "Price one task of 2,000 shots on IonQ.",
      provider: "IonQ",
      shots: 2000,
      tasks: 1,
      hint: undefined,
    });
  });

  it("carries explicit tasks and hint", () => {
    const { spec } = parseCostEstimate(JSON.stringify({ ...valid, tasks: 3, hint: "task fee" }));
    expect(spec!.tasks).toBe(3);
    expect(spec!.hint).toBe("task fee");
  });

  it("rejects invalid JSON, missing id, and missing prompt", () => {
    expect(parseCostEstimate("{nope").error).toMatch(/invalid cost-estimate JSON/);
    expect(parseCostEstimate(JSON.stringify({ ...valid, id: " " })).error).toMatch(/"id"/);
    expect(parseCostEstimate(JSON.stringify({ ...valid, prompt: "" })).error).toMatch(/"prompt"/);
  });

  it("rejects an unknown provider", () => {
    expect(parseCostEstimate(JSON.stringify({ ...valid, provider: "Nope" })).error).toMatch(
      /provider/
    );
  });

  it("rejects a per-minute simulator (the Rep drills the task+shot model)", () => {
    expect(parseCostEstimate(JSON.stringify({ ...valid, provider: "SV1" })).error).toMatch(
      /per-shot/
    );
  });

  it("rejects out-of-range or non-integer shots", () => {
    expect(parseCostEstimate(JSON.stringify({ ...valid, shots: MIN_SHOTS - 1 })).error).toMatch(
      /shots/
    );
    expect(parseCostEstimate(JSON.stringify({ ...valid, shots: MAX_SHOTS + 1 })).error).toMatch(
      /shots/
    );
    expect(parseCostEstimate(JSON.stringify({ ...valid, shots: 100.5 })).error).toMatch(/shots/);
  });

  it("rejects invalid tasks", () => {
    expect(parseCostEstimate(JSON.stringify({ ...valid, tasks: 0 })).error).toMatch(/tasks/);
    expect(parseCostEstimate(JSON.stringify({ ...valid, tasks: 2.5 })).error).toMatch(/tasks/);
  });
});
