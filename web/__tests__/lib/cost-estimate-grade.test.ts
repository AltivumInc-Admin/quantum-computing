import {
  costEstimateTruth,
  gradeCostEstimate,
  costEstimateReviewAnswer,
  fmtUsd,
} from "@/lib/cost-estimate-grade";
import { parseCostEstimate } from "@/lib/cost-estimate-schema";

function spec(overrides: Record<string, unknown> = {}) {
  return parseCostEstimate(
    JSON.stringify({
      id: "t",
      prompt: "p",
      provider: "IonQ",
      shots: 2000,
      ...overrides,
    })
  ).spec!;
}

describe("costEstimateTruth", () => {
  it("computes the GUIDE's worked example: IonQ 2,000 shots, 1 task = $20.30", () => {
    const { truth } = costEstimateTruth(spec());
    expect(truth!.correct).toBeCloseTo(20.3, 10);
    expect(truth!.taskFee).toBeCloseTo(0.3, 10);
    expect(truth!.shotFee).toBeCloseTo(20.0, 10);
  });

  it("builds four distinct options, sorted ascending, containing the misconceptions", () => {
    const { truth } = costEstimateTruth(spec());
    expect(truth!.options).toHaveLength(4);
    const sorted = [...truth!.options].sort((a, b) => a - b);
    expect(truth!.options).toEqual(sorted);
    // forgot-task-fee (20.00), forgot-shots (0.30), fee-per-shot (2000 x 0.31 = 620), correct.
    expect(truth!.options.map((v) => fmtUsd(v))).toEqual(["$0.30", "$20.00", "$20.30", "$620.00"]);
    expect(truth!.options[truth!.correctIndex]).toBeCloseTo(20.3, 2);
  });

  it("scales by tasks", () => {
    const { truth } = costEstimateTruth(spec({ tasks: 3 }));
    expect(truth!.correct).toBeCloseTo(60.9, 10);
    expect(truth!.taskFee).toBeCloseTo(0.9, 10);
  });

  it("fails loudly when distractors collide (IonQ at 30 shots: shot fee equals task fee)", () => {
    const { truth, error } = costEstimateTruth(spec({ shots: 30 }));
    expect(truth).toBeUndefined();
    expect(error).toMatch(/collide/);
  });

  it("reports the honest precision story: SE at p=0.5 is 1/(2 sqrt N)", () => {
    const { truth } = costEstimateTruth(spec({ shots: 2500 }));
    expect(truth!.sePercentPerTask).toBeCloseTo(1.0, 10); // 100 / (2 * 50)
  });
});

describe("gradeCostEstimate", () => {
  it("grades the correct index true and every other index false", () => {
    const { truth } = costEstimateTruth(spec());
    for (let i = 0; i < truth!.options.length; i++) {
      expect(gradeCostEstimate(i, truth!)).toBe(i === truth!.correctIndex);
    }
  });
});

describe("costEstimateReviewAnswer", () => {
  it("states the total and the decomposition", () => {
    const s = spec();
    const { truth } = costEstimateTruth(s);
    const answer = costEstimateReviewAnswer(s, truth!);
    expect(answer).toContain("$20.30");
    expect(answer).toContain("1 task");
    expect(answer).toContain("2,000");
  });
});
