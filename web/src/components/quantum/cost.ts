// Mirrors lib/utils/cost.py PRICING exactly (single source of truth for rates).
// Verified against https://aws.amazon.com/braket/pricing/ (2026-07-06). IonQ is the
// live Forte device ($0.08/shot); Aria is retired (its old $0.01 under-quoted ~8x).
export const PRICING = {
  IonQ: { perTask: 0.3, perShot: 0.08 }, // IonQ Forte (Aria retired)
  IQM: { perTask: 0.3, perShot: 0.00145 }, // IQM Garnet
  QuEra: { perTask: 0.3, perShot: 0.01 }, // QuEra Aquila (analog only)
  Rigetti: { perTask: 0.3, perShot: 0.000425 }, // Rigetti Cepheus
  SV1: { perMinute: 0.075 },
  DM1: { perMinute: 0.075 },
  TN1: { perMinute: 0.275 },
  LocalSimulator: { perMinute: 0 },
} as const;

export type Provider = keyof typeof PRICING;

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
