// Mirrors lib/utils/cost.py PRICING exactly (single source of truth for rates).
// Every figure re-verified 2026-09-04 against BOTH the AWS Price List API
// (AmazonBraket "Quantum Task" / "Quantum Task-Shot" / "Simulator Task") and each
// device's live deviceCapabilities.service.deviceCost; the two agree exactly.
//
// KEYS ARE PER-RATE, NOT PER-VENDOR. A key is the vendor name where that vendor
// bills one rate, and vendor_device where it bills more than one: IQM's Garnet
// ($0.00145/shot) and Emerald ($0.0016/shot) are different rates, so a single
// "IQM" key would silently price every Emerald run at Garnet's — the same class
// of mistake the retired IonQ Aria row made when it rendered Forte's $0.08/shot.
// Anything a learner reads goes through providerLabel(), not the raw key.
export const PRICING = {
  IonQ: { perTask: 0.3, perShot: 0.08 }, // IonQ Forte-1 and Forte Enterprise 1 (identical rate)
  IQM: { perTask: 0.3, perShot: 0.00145 }, // IQM Garnet
  IQM_Emerald: { perTask: 0.3, perShot: 0.0016 }, // IQM Emerald — deliberately NOT Garnet's rate
  QuEra: { perTask: 0.3, perShot: 0.01 }, // QuEra Aquila (analog only)
  AQT: { perTask: 0.3, perShot: 0.0235 }, // AQT IBEX Q1
  // Rigetti stopped being reference-only on 2026-09-04: Cepheus-1-108Q is ONLINE
  // in us-west-1, so devices.ts now carries its row and the old carve-out is gone.
  Rigetti: { perTask: 0.3, perShot: 0.000425 }, // Rigetti Cepheus-1-108Q
  SV1: { perMinute: 0.075 },
  DM1: { perMinute: 0.075 },
  // TN1 is RETIRED on Amazon Braket in every region that ever listed it (verified
  // 2026-09-04). Its rate stays because the device stays: devices.ts renders TN1 as
  // a retired row rather than deleting it, and the simulator-ladder lesson in
  // 02-hardware still teaches what a tensor-network simulator cost. A retired row
  // with no rate could only ever be priced at some other device's rate.
  TN1: { perMinute: 0.275 },
  LocalSimulator: { perMinute: 0 },
} as const;

export type Provider = keyof typeof PRICING;

/**
 * Rate keys whose device Amazon Braket has retired. Mirrors RETIRED_PROVIDERS in
 * lib/utils/cost.py, and exists for the same reason: the rate stays in the table
 * so the curriculum can teach it and price it historically, which means anything
 * presenting that number as a LIVE quote has to ask first.
 *
 * A live Price List SKU is not evidence of availability — TN1 still has priced
 * rows in the AWS Price List API. Only deviceStatus is evidence.
 */
export const RETIRED_PROVIDERS: ReadonlySet<Provider> = new Set<Provider>(["TN1"]);

/** True when this rate prices a device that can no longer accept a task. */
export function isRetired(provider: Provider): boolean {
  return RETIRED_PROVIDERS.has(provider);
}

/**
 * What a learner should SEE for a pricing key. The keys above are rate
 * identifiers ("IQM_Emerald"), not names anyone would read out loud, so every
 * select option, chip and label renders through here. Exhaustive by type: a new
 * PRICING key fails typecheck until it declares a label.
 */
const PROVIDER_LABELS: Record<Provider, string> = {
  IonQ: "IonQ",
  IQM: "IQM Garnet",
  IQM_Emerald: "IQM Emerald",
  QuEra: "QuEra",
  AQT: "AQT",
  Rigetti: "Rigetti",
  SV1: "SV1",
  DM1: "DM1",
  TN1: "TN1",
  LocalSimulator: "LocalSimulator",
};

export function providerLabel(provider: Provider): string {
  return PROVIDER_LABELS[provider];
}

export function estimateCost(provider: Provider, shots: number, minutes: number, tasks = 1): number {
  const p = PRICING[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  if ("perShot" in p) return tasks * (p.perTask + p.perShot * shots);
  return p.perMinute * minutes * tasks;
}

export function isPerShot(provider: Provider): boolean {
  return "perShot" in PRICING[provider];
}

/** Human-readable rate label for the device table — derived from PRICING, the single source. */
export function costLabel(provider: Provider): string {
  const p = PRICING[provider];
  if ("perMinute" in p) return p.perMinute === 0 ? "Free" : `$${p.perMinute}/min`;
  return `$${p.perTask.toFixed(2)}/task + $${p.perShot}/shot`;
}
