// Parse + validate the JSON inside a ```qchallenge fenced block.
//
// A challenge presents a prompt, a target circuit (the reference solution the
// learner's circuit is graded against, up to global phase), and optional
// scaffolding. Tier "ts" grades instantly in-browser with the qcsim-parity TS
// kernel; tier "py" defers to the Pyodide grader for free-form Braket Python.

export interface ChallengeSpec {
  id: string;
  prompt: string;
  qubits?: number;
  target: { program: string };
  starter: string;
  allowedGates?: string[];
  hint?: string;
  tier: "ts" | "py";
}

export interface ParsedChallenge {
  spec?: ChallengeSpec;
  error?: string;
}

// Small deterministic hash so a challenge gets a stable localStorage key (for
// progress persistence) without the author having to assign an id by hand.
function stableId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return "c" + (h >>> 0).toString(36);
}

export function parseChallenge(source: string): ParsedChallenge {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(source);
  } catch (e) {
    return { error: `invalid challenge JSON: ${(e as Error).message}` };
  }

  if (typeof data.prompt !== "string" || !data.prompt.trim()) {
    return { error: 'challenge needs a non-empty "prompt" string' };
  }
  const target = data.target as { program?: unknown } | undefined;
  if (!target || typeof target.program !== "string" || !target.program.trim()) {
    return { error: 'challenge needs a "target": { "program": "..." }' };
  }
  const tier = data.tier === "py" ? "py" : "ts";
  const allowedGates = Array.isArray(data.allowedGates)
    ? (data.allowedGates as unknown[]).filter((g): g is string => typeof g === "string")
    : undefined;

  const spec: ChallengeSpec = {
    id: typeof data.id === "string" && data.id ? data.id : stableId(data.prompt),
    prompt: data.prompt,
    qubits: typeof data.qubits === "number" ? data.qubits : undefined,
    target: { program: target.program },
    starter: typeof data.starter === "string" ? data.starter : "",
    allowedGates,
    hint: typeof data.hint === "string" ? data.hint : undefined,
    tier,
  };
  return { spec };
}
