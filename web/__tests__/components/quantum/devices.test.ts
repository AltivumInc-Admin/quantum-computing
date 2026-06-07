import { DEVICES, sortDevices } from "@/components/quantum/devices";

describe("devices data", () => {
  it("includes the Braket QPUs, managed sims, and local", () => {
    const names = DEVICES.map((d) => d.model);
    expect(names).toEqual(expect.arrayContaining(["Aria", "Forte", "Garnet", "Aquila", "SV1", "DM1", "TN1", "Local"]));
  });
  it("marks QuEra Aquila as not gate-model (analog)", () => {
    expect(DEVICES.find((d) => d.model === "Aquila")!.gateModel).toBe(false);
  });
  it("sorts by qubits descending", () => {
    const sorted = sortDevices(DEVICES, "qubits", "desc");
    expect(sorted[0].qubits).toBeGreaterThanOrEqual(sorted[sorted.length - 1].qubits);
  });
});
