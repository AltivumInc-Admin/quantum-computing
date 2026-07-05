import { predictionTruth, gradePrediction, predictReviewAnswer } from "@/lib/predict-grade";
import type { PredictSpec, PredictMode } from "@/lib/predict-schema";

const spec = (program: string, mode: PredictMode = "top-outcome"): PredictSpec => ({
  id: "x",
  prompt: "p",
  program,
  mode,
});

describe("predict-grade", () => {
  it("computes the truth for a Bell circuit (two reachable states, tied top)", () => {
    const { truth } = predictionTruth(spec("H 0\nCNOT 0 1", "nonzero-states"));
    expect(truth).toBeDefined();
    expect(truth!.n).toBe(2);
    expect([...truth!.nonzeroIndices].sort((a, b) => a - b)).toEqual([0, 3]);
    expect([...truth!.topIndices].sort((a, b) => a - b)).toEqual([0, 3]);
  });

  it("top-outcome accepts either tied argmax and rejects a zero state", () => {
    const { truth } = predictionTruth(spec("H 0\nCNOT 0 1", "top-outcome"));
    expect(gradePrediction(0, truth!, "top-outcome")).toBe(true);
    expect(gradePrediction(3, truth!, "top-outcome")).toBe(true);
    expect(gradePrediction(1, truth!, "top-outcome")).toBe(false);
  });

  it("nonzero-states requires the exact set, order-independent", () => {
    const { truth } = predictionTruth(spec("H 0\nCNOT 0 1", "nonzero-states"));
    expect(gradePrediction([0, 3], truth!, "nonzero-states")).toBe(true);
    expect(gradePrediction([3, 0], truth!, "nonzero-states")).toBe(true);
    expect(gradePrediction([0], truth!, "nonzero-states")).toBe(false); // incomplete
    expect(gradePrediction([0, 1, 3], truth!, "nonzero-states")).toBe(false); // extra
  });

  it("a deterministic single-outcome circuit has one top index", () => {
    const { truth } = predictionTruth(spec("X 0", "top-outcome")); // |1> on 1 qubit
    expect(truth!.n).toBe(1);
    expect(truth!.topIndices).toEqual([1]);
    expect(truth!.nonzeroIndices).toEqual([1]);
  });

  it("rejects a theta-bound (non-concrete) circuit", () => {
    const r = predictionTruth(spec("RY 0 theta"));
    expect(r.truth).toBeUndefined();
    expect(r.error).toMatch(/concrete/i);
  });

  it("rejects an unparseable circuit", () => {
    const r = predictionTruth(spec("FOO 0"));
    expect(r.truth).toBeUndefined();
    expect(r.error).toBeTruthy();
  });

  it("formats review answers for both modes", () => {
    const { truth } = predictionTruth(spec("H 0\nCNOT 0 1", "nonzero-states"));
    expect(predictReviewAnswer(truth!, "nonzero-states")).toBe("Nonzero basis states: |00⟩, |11⟩");
    expect(predictReviewAnswer(truth!, "top-outcome")).toBe("Most likely outcome: |00⟩ or |11⟩ (~50%)");
  });
});
