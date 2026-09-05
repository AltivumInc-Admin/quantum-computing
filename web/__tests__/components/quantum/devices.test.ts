import {
  DEVICES,
  dispatchableDevices,
  isDispatchable,
  sortDevices,
} from "@/components/quantum/devices";
import { PRICING, isRetired, type Provider } from "@/components/quantum/cost";

describe("devices data", () => {
  it("includes the Braket QPUs, managed sims, and local", () => {
    const names = DEVICES.map((d) => d.model);
    expect(names).toEqual(
      expect.arrayContaining([
        "Forte-1",
        "Forte Enterprise",
        "IBEX Q1",
        "Garnet",
        "Emerald",
        "Cepheus-1-108Q",
        "Aquila",
        "SV1",
        "DM1",
        "TN1",
        "Local",
      ])
    );
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

  /**
   * Facts checked against the live fleet on 2026-09-04 (`aws braket
   * search-devices`, all five Braket regions, cross-read against each device's
   * deviceCapabilities). These are the numbers a learner reads off the table.
   */
  it("carries the verified qubit count for each device", () => {
    const qubits = Object.fromEntries(DEVICES.map((d) => [d.model, d.qubits]));
    expect(qubits).toMatchObject({
      "Forte-1": 36,
      "Forte Enterprise": 36,
      "IBEX Q1": 12,
      Garnet: 20,
      Emerald: 54,
      // 107, not 108: paradigm.qubitCount is 107 despite the model name, and the
      // index space is 0-based and non-contiguous (0..107, with index 8 absent).
      "Cepheus-1-108Q": 107,
      Aquila: 256,
    });
  });
});

/**
 * Lifecycle. The catalog used to handle a retirement by DELETING the row, which
 * is why nothing here could distinguish "retired" from "never existed". It now
 * carries status instead, and these assertions are the reason that is safe.
 */
describe("device lifecycle", () => {
  it("keeps TN1 in the catalog, marked retired rather than deleted", () => {
    // The regression this locks: 02-hardware teaches the simulator ladder
    // Local -> SV1 -> DM1 -> TN1. A learner who follows that lesson here must
    // find TN1 and learn it is gone, not find an empty space.
    const tn1 = DEVICES.find((d) => d.model === "TN1");
    expect(tn1).toBeDefined();
    expect(tn1!.status).toBe("retired");
  });

  it("distinguishes an offline device from a retired one", () => {
    // IonQ Forte-1 is OFFLINE (calibration/maintenance, reversible, ARN still
    // valid); TN1 is RETIRED (gone for good). Collapsing the two would teach a
    // learner that a maintenance window is a death notice.
    expect(DEVICES.find((d) => d.model === "Forte-1")!.status).toBe("offline");
    expect(DEVICES.find((d) => d.model === "TN1")!.status).toBe("retired");
  });

  it("keeps a live device for every vendor whose fleet is only partly down", () => {
    // Forte-1 being offline must not read as "IonQ is unreachable": Forte
    // Enterprise 1 is online at the same rate, qubit count and topology.
    expect(DEVICES.find((d) => d.model === "Forte Enterprise")!.status).toBe("online");
  });

  it("dispatchableDevices offers only devices Braket would accept a task for", () => {
    const live = dispatchableDevices().map((d) => d.model);
    expect(live).not.toContain("TN1");
    expect(live).not.toContain("Forte-1");
    expect(live).toContain("Forte Enterprise");
    expect(live).toContain("Garnet");
    expect(dispatchableDevices().every(isDispatchable)).toBe(true);
  });

  it("declares a status on every row (no row defaults into looking live)", () => {
    for (const device of DEVICES) {
      expect(["online", "offline", "retired"]).toContain(device.status);
    }
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
   * Priced but deliberately device-less. Empty as of 2026-09-04: the last
   * carve-out was Rigetti, which stopped being reference-only when
   * Cepheus-1-108Q came online in us-west-1 and earned a row. Kept as a named,
   * empty list rather than deleted, because the two assertions below are what
   * make an exception deliberate instead of an oversight.
   */
  const REFERENCE_ONLY: Provider[] = [];

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

  it("prices IQM's two devices from two different keys", () => {
    // Garnet is $0.00145/shot and Emerald is $0.0016/shot. A shared "IQM" key
    // would quote every Emerald run ~10% under its true cost — the Aria failure
    // with different names on it.
    const garnet = DEVICES.find((d) => d.model === "Garnet")!;
    const emerald = DEVICES.find((d) => d.model === "Emerald")!;
    expect(garnet.provider).not.toBe(emerald.provider);
    const gRate = PRICING[garnet.provider] as { perShot: number };
    const eRate = PRICING[emerald.provider] as { perShot: number };
    expect(gRate.perShot).not.toBe(eRate.perShot);
  });

  it("agrees with cost.ts about which rates are retired", () => {
    // Two files record the same retirement — devices.ts per DEVICE (status) and
    // cost.ts per RATE KEY (RETIRED_PROVIDERS). They can disagree, which is the
    // whole reason to assert it: a rate flagged retired must have no live device,
    // and a key whose every device is retired must be flagged.
    for (const provider of Object.keys(PRICING) as Provider[]) {
      const rows = DEVICES.filter((d) => d.provider === provider);
      if (rows.length === 0) continue;
      const allRetired = rows.every((d) => d.status === "retired");
      expect(isRetired(provider)).toBe(allRetired);
    }
  });

  it("lists no hardware whose rate the pricing table no longer carries", () => {
    // IonQ Aria: retired, and its rate is GONE from PRICING, so a row for it
    // could only ever render its successor's price. That is the case deletion
    // is still right for — unlike TN1, whose own rate is retained precisely so
    // its retired row can be priced honestly.
    expect(DEVICES.map((d) => d.model)).not.toContain("Aria");
    expect(Object.keys(PRICING)).not.toContain("Aria");
  });
});
