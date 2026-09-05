import { type Provider } from "./cost";

/**
 * The legal technology families. Promoted from a trailing comment to a union so
 * the filter options in device-table.tsx and the catalog below cannot drift:
 * a new family fails typecheck until the data declares it, and the filter list
 * is derived from the data rather than hand-maintained.
 */
export type Technology =
  | "Trapped ion"
  | "Superconducting"
  | "Neutral atom"
  | "Simulator";

/**
 * Braket's own lifecycle for a device, as reported by SearchDevices.
 *
 *   online   — accepting tasks today.
 *   offline  — a REVERSIBLE operational state (calibration, maintenance). The
 *              ARN is still valid and the device is expected back.
 *   retired  — permanently gone. The ARN will never accept a task again.
 *
 * The distinction is load-bearing pedagogy, not bookkeeping: "IonQ Forte-1 is
 * down for calibration" and "TN1 no longer exists" are different lessons, and a
 * table that flattened both to absence would teach neither.
 */
export type DeviceStatus = "online" | "offline" | "retired";

export interface Device {
  technology: Technology;
  vendor: string;
  model: string;
  qubits: number;
  connectivity: string; // "All-to-all" | "Square lattice" | "Lattice" | "Analog" | "—"
  gateModel: boolean;
  provider: Provider; // PRICING key — the cost label is derived from cost.ts, not stored
  /** Required, deliberately: a new row cannot forget to say whether it is live. */
  status: DeviceStatus;
  note?: string; // optional cost-cell decoration (e.g. DM1's "noise")
}

/**
 * The Braket fleet the curriculum teaches, plus the free local simulator. This is
 * the teaching mirror of lib/hardware/devices.py DEVICES — keep the two in
 * lockstep when Braket's fleet changes. Fleet verified 2026-09-04 against
 * `aws braket search-devices` across all five Braket regions.
 *
 * RETIRED AND OFFLINE HARDWARE STAYS HERE, MARKED. That reverses this file's
 * previous policy ("retired hardware is deliberately absent"), and the reversal
 * is deliberate. Deletion was chosen for IonQ Aria because a row with no rate of
 * its own would render at its successor's price — a real failure the old catalog
 * shipped. But silent deletion has a failure of its own: a learner who has just
 * read 02-hardware's simulator ladder (Local -> SV1 -> DM1 -> TN1) and comes here
 * to check TN1 finds nothing, and "nothing" reads as "I mis-remembered", not as
 * "AWS retired it". The `status` field solves both: the row is present and
 * labelled, and it is priced from its OWN retained rate in cost.ts, never a
 * successor's. 02-hardware/GUIDE.md still carries the narrative history.
 *
 * Every priced provider now has at least one row — the Rigetti reference-only
 * carve-out ended when Cepheus-1-108Q came online — and devices.test.ts asserts
 * that in both directions.
 */
export const DEVICES: Device[] = [
  // --- Trapped ion --------------------------------------------------------
  // Forte-1 is OFFLINE, not retired (us-east-1, updated 2026-08-24). Forte
  // Enterprise 1 (Basel) is the live IonQ machine: same 36 qubits, same native
  // gate set, same all-to-all topology, same $0.30 + $0.08/shot — which is why
  // both share the "IonQ" pricing key.
  { technology: "Trapped ion", vendor: "IonQ", model: "Forte-1", qubits: 36, connectivity: "All-to-all", gateModel: true, provider: "IonQ", status: "offline" },
  { technology: "Trapped ion", vendor: "IonQ", model: "Forte Enterprise", qubits: 36, connectivity: "All-to-all", gateModel: true, provider: "IonQ", status: "online" },
  // AQT is a vendor the curriculum has never carried before. IBEX Q1 reports
  // fullyConnected with an EMPTY connectivity graph, so "All-to-all" here comes
  // from the capability flag, not from counting edges.
  { technology: "Trapped ion", vendor: "AQT", model: "IBEX Q1", qubits: 12, connectivity: "All-to-all", gateModel: true, provider: "AQT", status: "online" },

  // --- Superconducting ----------------------------------------------------
  { technology: "Superconducting", vendor: "IQM", model: "Garnet", qubits: 20, connectivity: "Square lattice", gateModel: true, provider: "IQM", status: "online" },
  // Emerald is 54 qubits on a lattice (85 undirected edges, 1-indexed 1..54) and
  // bills at its OWN per-shot rate — hence the separate IQM_Emerald pricing key.
  { technology: "Superconducting", vendor: "IQM", model: "Emerald", qubits: 54, connectivity: "Lattice", gateModel: true, provider: "IQM_Emerald", status: "online" },
  // Cepheus-1-108Q reports qubitCount 107 despite the "108Q" in its name, and its
  // qubit indices are 0-based and NON-contiguous (0..107 with index 8 absent). 107 is
  // the honest number to teach.
  { technology: "Superconducting", vendor: "Rigetti", model: "Cepheus-1-108Q", qubits: 107, connectivity: "Lattice", gateModel: true, provider: "Rigetti", status: "online" },

  // --- Neutral atom -------------------------------------------------------
  { technology: "Neutral atom", vendor: "QuEra", model: "Aquila", qubits: 256, connectivity: "Analog", gateModel: false, provider: "QuEra", status: "online" },

  // --- Simulators ---------------------------------------------------------
  { technology: "Simulator", vendor: "AWS", model: "SV1", qubits: 34, connectivity: "—", gateModel: true, provider: "SV1", status: "online" },
  { technology: "Simulator", vendor: "AWS", model: "DM1", qubits: 17, connectivity: "—", gateModel: true, provider: "DM1", status: "online", note: "noise" },
  // TN1 is RETIRED in us-east-1, us-west-2 and eu-west-2 — every region that ever
  // listed it. It stays visible because the simulator ladder is a lesson.
  { technology: "Simulator", vendor: "AWS", model: "TN1", qubits: 50, connectivity: "—", gateModel: true, provider: "TN1", status: "retired" },
  { technology: "Simulator", vendor: "Local", model: "Local", qubits: 25, connectivity: "—", gateModel: true, provider: "LocalSimulator", status: "online" },
];

/** What a learner should read for a lifecycle state. */
export const STATUS_LABELS: Record<DeviceStatus, string> = {
  online: "Online",
  offline: "Offline",
  retired: "Retired",
};

/** True when Braket would actually accept a task for this device today. */
export const isDispatchable = (device: Device): boolean => device.status === "online";

/**
 * The rows a surface may present as somewhere you can send work. Anything that
 * offers a device as a choice (the Hybrid Job backend picker, for instance)
 * derives from this, so a retirement removes the option instead of advertising a
 * backend the service will refuse.
 */
export const dispatchableDevices = (devices: Device[] = DEVICES): Device[] =>
  devices.filter(isDispatchable);

export type SortKey = "qubits" | "model" | "technology";

export function sortDevices(devices: Device[], key: SortKey, dir: "asc" | "desc"): Device[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...devices].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return sign * (av - bv);
    return sign * String(av).localeCompare(String(bv));
  });
}
