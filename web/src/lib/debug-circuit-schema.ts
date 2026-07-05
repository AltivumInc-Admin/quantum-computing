// Parse + validate the JSON inside a ```qdebug fenced block.
//
// A debug Rep presents a BROKEN circuit prefilled in the editor; the learner
// repairs it until its state matches the target (up to global phase). It is
// the challenge widget's shape with two deliberate differences: `broken` is a
// required first-class field (not an optional starter), and `id` is REQUIRED —
// it is the permanent `debug:<id>` schedule key, and unlike a challenge there
// is no auto-hash fallback, because hashing the prompt would silently mint a
// new FSRS card whenever the prompt copy is edited.

export interface DebugCircuitSpec {
  id: string;
  prompt: string;
  qubits?: number;
  broken: { program: string };
  target: { program: string };
  allowedGates?: string[];
  hint?: string;
}

export interface ParsedDebugCircuit {
  spec?: DebugCircuitSpec;
  error?: string;
}

export function parseDebugCircuit(source: string): ParsedDebugCircuit {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(source);
  } catch (e) {
    return { error: `invalid debug JSON: ${(e as Error).message}` };
  }

  if (typeof data.id !== "string" || !data.id.trim()) {
    return { error: 'debug needs an explicit non-empty "id" (it is the permanent schedule key)' };
  }
  if (typeof data.prompt !== "string" || !data.prompt.trim()) {
    return { error: 'debug needs a non-empty "prompt" string' };
  }
  const broken = data.broken as { program?: unknown } | undefined;
  if (!broken || typeof broken.program !== "string" || !broken.program.trim()) {
    return { error: 'debug needs a "broken": { "program": "..." } — the buggy circuit to fix' };
  }
  const target = data.target as { program?: unknown } | undefined;
  if (!target || typeof target.program !== "string" || !target.program.trim()) {
    return { error: 'debug needs a "target": { "program": "..." }' };
  }
  const allowedGates = Array.isArray(data.allowedGates)
    ? (data.allowedGates as unknown[]).filter((g): g is string => typeof g === "string")
    : undefined;

  const spec: DebugCircuitSpec = {
    id: data.id,
    prompt: data.prompt,
    qubits: typeof data.qubits === "number" ? data.qubits : undefined,
    broken: { program: broken.program },
    target: { program: target.program },
    allowedGates,
    hint: typeof data.hint === "string" ? data.hint : undefined,
  };
  return { spec };
}
