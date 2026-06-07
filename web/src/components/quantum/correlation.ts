import { parseProgram, type Program } from "./qsim-dsl";

export interface CorrelationSpec { prompt: string; entangled: Program; product: Program; }
export interface ParsedCorrelation { spec: CorrelationSpec | null; error?: string; }

export function parseCorrelation(source: string): ParsedCorrelation {
  try {
    const data = JSON.parse(source) as Partial<{ prompt: string; entangled: string; product: string }>;
    if (typeof data.prompt !== "string" || typeof data.entangled !== "string" || typeof data.product !== "string") {
      throw new Error('expected { "prompt", "entangled", "product" } strings');
    }
    const entangled = parseProgram(data.entangled);
    const product = parseProgram(data.product);
    for (const [label, p] of [["entangled", entangled], ["product", product]] as const) {
      if (p.error) throw new Error(`${label}: ${p.error}`);
      if (p.n !== 2) throw new Error(`${label} circuit must use exactly two qubits`);
    }
    return { spec: { prompt: data.prompt, entangled, product } };
  } catch (e) {
    return { spec: null, error: (e as Error).message };
  }
}

/** Inverse-transform sample one basis-state index from `probs`. */
export function sampleOutcome(probs: number[], rng: () => number = Math.random): number {
  const total = probs.reduce((a, b) => a + b, 0);
  const r = rng() * total;
  let acc = 0;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (r <= acc) return i; }
  return probs.length - 1;
}
