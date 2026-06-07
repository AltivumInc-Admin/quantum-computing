// Mirrors lib/utils/cost.py PRICING exactly (single source of truth for rates).
export const PRICING = {
  IonQ: { perTask: 0.3, perShot: 0.01 },
  IQM: { perTask: 0.3, perShot: 0.00145 },
  QuEra: { perTask: 0.3, perShot: 0.01 },
  Rigetti: { perTask: 0.3, perShot: 0.00035 },
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
