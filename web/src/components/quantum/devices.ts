export interface Device {
  technology: string; // "Trapped ion" | "Superconducting" | "Neutral atom" | "Simulator"
  vendor: string;
  model: string;
  qubits: number;
  connectivity: string; // "All-to-all" | "Square lattice" | "Analog" | "—"
  gateModel: boolean;
  cost: string;
}

export const DEVICES: Device[] = [
  { technology: "Trapped ion", vendor: "IonQ", model: "Aria", qubits: 25, connectivity: "All-to-all", gateModel: true, cost: "$0.30/task + $0.01/shot" },
  { technology: "Trapped ion", vendor: "IonQ", model: "Forte", qubits: 36, connectivity: "All-to-all", gateModel: true, cost: "$0.30/task + $0.01/shot" },
  { technology: "Superconducting", vendor: "IQM", model: "Garnet", qubits: 20, connectivity: "Square lattice", gateModel: true, cost: "$0.30/task + $0.00145/shot" },
  { technology: "Neutral atom", vendor: "QuEra", model: "Aquila", qubits: 256, connectivity: "Analog", gateModel: false, cost: "$0.30/task + $0.01/shot" },
  { technology: "Simulator", vendor: "AWS", model: "SV1", qubits: 34, connectivity: "—", gateModel: true, cost: "$0.075/min" },
  { technology: "Simulator", vendor: "AWS", model: "DM1", qubits: 17, connectivity: "—", gateModel: true, cost: "$0.075/min (noise)" },
  { technology: "Simulator", vendor: "AWS", model: "TN1", qubits: 50, connectivity: "—", gateModel: true, cost: "$0.275/min" },
  { technology: "Simulator", vendor: "Local", model: "Local", qubits: 25, connectivity: "—", gateModel: true, cost: "Free" },
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
