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

/** One Born-rule draw — single-sourced from shots.ts (which skips zero-mass outcomes). */
export { sampleIndex as sampleOutcome } from "./shots";
