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
  it("computes the GUIDE's worked example: IonQ 2,000 shots, 1 task = $160.30", () => {
    const { truth } = costEstimateTruth(spec());
    expect(truth!.correct).toBeCloseTo(160.3, 10);
    expect(truth!.taskFee).toBeCloseTo(0.3, 10);
    expect(truth!.shotFee).toBeCloseTo(160.0, 10);
  });

  it("builds four distinct options containing the misconceptions, with correct flagged", () => {
    const { truth } = costEstimateTruth(spec());
    expect(truth!.options).toHaveLength(4);
    // forgot-task-fee (160.00), forgot-shots (0.30), fee-per-shot (2000 x 0.38 = 760), correct.
    expect(new Set(truth!.options.map((v) => fmtUsd(v)))).toEqual(
      new Set(["$0.30", "$160.00", "$160.30", "$760.00"])
    );
    expect(truth!.options[truth!.correctIndex]).toBeCloseTo(160.3, 2);
  });

  it("varies the correct option's position across Rep ids (no structural leak)", () => {
    // Ascending order put the correct total third of four for EVERY spec —
    // "always pick the second-largest" solved the Rep without arithmetic.
    const positions = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map(
        (id) => costEstimateTruth(spec({ id })).truth!.correctIndex
      )
    );
    expect(positions.size).toBeGreaterThan(1);
    // And the order is stable for a given id (deterministic re-renders).
    expect(costEstimateTruth(spec({ id: "a" })).truth!.options).toEqual(
      costEstimateTruth(spec({ id: "a" })).truth!.options
    );
  });

  it("settles money in cents so the itemized rows always sum to the total", () => {
    // IQM at 100 shots lands on a half cent: three independently-rounded
    // doubles rendered "$0.30 + $0.15 = Total $0.44". Cent settlement fixes it.
    const iqm = costEstimateTruth(spec({ provider: "IQM", shots: 100 })).truth!;
    expect(fmtUsd(iqm.taskFee)).toBe("$0.30");
    expect(fmtUsd(iqm.shotFee)).toBe("$0.15");
    expect(fmtUsd(iqm.correct)).toBe("$0.45");
    expect(iqm.taskFee + iqm.shotFee).toBeCloseTo(iqm.correct, 10);

    const rigetti = costEstimateTruth(spec({ provider: "Rigetti", shots: 2300 })).truth!;
    expect(rigetti.taskFee + rigetti.shotFee).toBeCloseTo(rigetti.correct, 10);
  });

  it("accepts every per-shot provider at the schema floor (no unrenderable valid spec)", () => {
    for (const provider of ["IonQ", "IQM", "QuEra", "Rigetti"]) {
      expect(costEstimateTruth(spec({ provider, shots: 15 })).truth).toBeDefined();
    }
  });

  it("scales by tasks", () => {
    const { truth } = costEstimateTruth(spec({ tasks: 3 }));
    expect(truth!.correct).toBeCloseTo(480.9, 10); // 3 × (0.30 + 2000 × 0.08)
    expect(truth!.taskFee).toBeCloseTo(0.9, 10);
  });

  it("fails loudly when distractors collide (QuEra at 30 shots: shot fee equals task fee)", () => {
    const { truth, error } = costEstimateTruth(spec({ provider: "QuEra", shots: 30 }));
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
    expect(answer).toContain("$160.30");
    expect(answer).toContain("1 task");
    expect(answer).toContain("2,000");
  });
});
