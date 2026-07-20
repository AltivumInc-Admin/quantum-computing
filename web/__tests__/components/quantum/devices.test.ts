import { DEVICES, sortDevices } from "@/components/quantum/devices";
import { PRICING, type Provider } from "@/components/quantum/cost";

describe("devices data", () => {
  it("includes the Braket QPUs, managed sims, and local", () => {
    const names = DEVICES.map((d) => d.model);
    expect(names).toEqual(expect.arrayContaining(["Forte", "Garnet", "Aquila", "SV1", "DM1", "TN1", "Local"]));
  });
  it("marks QuEra Aquila as not gate-model (analog)", () => {
    expect(DEVICES.find((d) => d.model === "Aquila")!.gateModel).toBe(false);
  });
  it("sorts by qubits descending", () => {
    const sorted = sortDevices(DEVICES, "qubits", "desc");
    expect(sorted[0].qubits).toBeGreaterThanOrEqual(sorted[sorted.length - 1].qubits);
  });
  it("sorts a string column via localeCompare (model ascending)", () => {
    const models = sortDevices(DEVICES, "model", "asc").map((d) => d.model);
    expect(models).toEqual([...models].sort((a, b) => a.localeCompare(b)));
  });
  it("asc yields a fully ascending numeric order (not just matching endpoints)", () => {
    const qubits = sortDevices(DEVICES, "qubits", "asc").map((d) => d.qubits);
    expect(qubits).toEqual(DEVICES.map((d) => d.qubits).sort((a, b) => a - b));
  });
  it("keys rows by a unique model name (the table uses model as the React key)", () => {
    const models = DEVICES.map((d) => d.model);
    expect(new Set(models).size).toBe(models.length);
  });
});

/**
 * Cross-catalog guard. The device catalog and the pricing table are two hand-
 * maintained mirrors of the same Braket fleet, and they had already drifted:
 * a retired IonQ Aria row survived in DEVICES long after cost.ts declared Aria
 * retired, so the table rendered Aria at Forte's $0.08/shot — a rate Aria never
 * charged. These assertions make the NEXT fleet change fail loudly here instead
 * of silently mispricing a lesson.
 */
describe("device catalog <-> pricing catalog", () => {
  /**
   * Priced but deliberately device-less. lib/utils/cost.py: "Rigetti is
   * reference pricing only — no Rigetti device is currently dispatchable via
   * lib.hardware.DEVICES (kept for the cost estimator script / teaching
   * reference)." If a Rigetti device ever becomes dispatchable, add its row and
   * drop it from this list — the second assertion below will demand it.
   */
  const REFERENCE_ONLY: Provider[] = ["Rigetti"];

  it("prices every device it lists", () => {
    for (const device of DEVICES) {
      expect(Object.keys(PRICING)).toContain(device.provider);
    }
  });

  it("lists a device for every priced provider except the reference-only carve-out", () => {
    const withRows = new Set(DEVICES.map((d) => d.provider));
    const missing = (Object.keys(PRICING) as Provider[]).filter(
      (p) => !withRows.has(p) && !REFERENCE_ONLY.includes(p)
    );
    expect(missing).toEqual([]);
  });

  it("keeps the reference-only providers out of the device table", () => {
    // A row here would be priced from PRICING and presented as live hardware —
    // exactly the failure mode the retired Aria row shipped.
    const bogus = DEVICES.filter((d) => REFERENCE_ONLY.includes(d.provider));
    expect(bogus).toEqual([]);
  });

  it("lists no retired hardware (the catalog mirrors lib/hardware/devices.py)", () => {
    // IonQ Aria: retired per lib/utils/cost.py, lib/hardware/devices.py, and
    // 02-hardware/GUIDE.md. Its rate is gone from PRICING, so any row for it can
    // only ever render its successor's price.
    expect(DEVICES.map((d) => d.model)).not.toContain("Aria");
  });
});
