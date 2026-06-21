import { estimateCost, costLabel, PRICING } from "@/components/quantum/cost";

describe("estimateCost", () => {
  it("IonQ 1000 shots, 1 task = $10.30", () => {
    expect(estimateCost("IonQ", 1000, 1, 1)).toBeCloseTo(10.3, 4);
  });
  it("IQM 1000 shots = $1.745", () => {
    expect(estimateCost("IQM", 1000, 1, 1)).toBeCloseTo(0.3 + 1.45, 4);
  });
  it("SV1 2 minutes = $0.15", () => {
    expect(estimateCost("SV1", 1000, 2, 1)).toBeCloseTo(0.15, 4);
  });
  it("LocalSimulator is free", () => {
    expect(estimateCost("LocalSimulator", 1000, 5, 3)).toBe(0);
  });
  it("scales by task count for per-shot devices", () => {
    expect(estimateCost("IonQ", 1000, 1, 3)).toBeCloseTo(30.9, 4);
  });
  it("throws on unknown provider", () => {
    expect(() => estimateCost("Nope" as keyof typeof PRICING, 1, 1, 1)).toThrow();
  });
});

describe("costLabel", () => {
  it("formats per-shot providers exactly as the device table did", () => {
    expect(costLabel("IonQ")).toBe("$0.30/task + $0.01/shot");
    expect(costLabel("IQM")).toBe("$0.30/task + $0.00145/shot");
  });
  it("formats per-minute simulators", () => {
    expect(costLabel("SV1")).toBe("$0.075/min");
    expect(costLabel("TN1")).toBe("$0.275/min");
  });
  it("labels the free local simulator", () => {
    expect(costLabel("LocalSimulator")).toBe("Free");
  });
});
