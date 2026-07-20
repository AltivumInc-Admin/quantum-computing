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

export interface Device {
  technology: Technology;
  vendor: string;
  model: string;
  qubits: number;
  connectivity: string; // "All-to-all" | "Square lattice" | "Analog" | "—"
  gateModel: boolean;
  provider: Provider; // PRICING key — the cost label is derived from cost.ts, not stored
  note?: string; // optional cost-cell decoration (e.g. DM1's "noise")
}

/**
 * Devices a learner can actually reach on Braket today, plus the free local
 * simulator. This is the teaching mirror of lib/hardware/devices.py DEVICES
 * (the dispatchable catalog) — keep the two in lockstep when Braket's fleet
 * changes. Retired hardware is deliberately absent: the cost cell is derived
 * from cost.ts PRICING, which carries only current rates, so a retired row
 * would necessarily be priced at its successor's rate. (IonQ Aria was removed
 * for exactly that reason: it is retired per lib/utils/cost.py and
 * lib/hardware/devices.py, and its row was rendering Forte's $0.08/shot.)
 * 02-hardware/GUIDE.md carries the retirement as prose, which is where history
 * belongs.
 *
 * Not every priced provider gets a row: cost.ts/cost.py price Rigetti as
 * reference-only ("no Rigetti device is currently dispatchable"). That carve-out
 * is asserted explicitly in devices.test.ts so the exception stays deliberate.
 */
export const DEVICES: Device[] = [
  { technology: "Trapped ion", vendor: "IonQ", model: "Forte", qubits: 36, connectivity: "All-to-all", gateModel: true, provider: "IonQ" },
  { technology: "Superconducting", vendor: "IQM", model: "Garnet", qubits: 20, connectivity: "Square lattice", gateModel: true, provider: "IQM" },
  { technology: "Neutral atom", vendor: "QuEra", model: "Aquila", qubits: 256, connectivity: "Analog", gateModel: false, provider: "QuEra" },
  { technology: "Simulator", vendor: "AWS", model: "SV1", qubits: 34, connectivity: "—", gateModel: true, provider: "SV1" },
  { technology: "Simulator", vendor: "AWS", model: "DM1", qubits: 17, connectivity: "—", gateModel: true, provider: "DM1", note: "noise" },
  { technology: "Simulator", vendor: "AWS", model: "TN1", qubits: 50, connectivity: "—", gateModel: true, provider: "TN1" },
  { technology: "Simulator", vendor: "Local", model: "Local", qubits: 25, connectivity: "—", gateModel: true, provider: "LocalSimulator" },
];

export type SortKey = "qubits" | "model" | "technology";

export function sortDevices(devices: Device[], key: SortKey, dir: "asc" | "desc"): Device[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...devices].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return sign * (av - bv);
    return sign * String(av).localeCompare(String(bv));
  });
}
