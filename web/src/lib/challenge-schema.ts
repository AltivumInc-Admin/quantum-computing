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

export function parseChallenge(source: string): ParsedChallenge {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(source);
  } catch (e) {
    return { error: `invalid challenge JSON: ${(e as Error).message}` };
  }

  // The id is the learner's PERMANENT schedule key (FSRS card, solved flag,
  // personal best) — it must be explicit. The old fallback hashed the prompt,
  // which meant any copy-edit to the prompt silently orphaned every learner's
  // card (and orphaned cards resurface forever on /review; sync merge never
  // deletes). The two shipped fences that relied on the fallback were
  // backfilled with their then-current hashes, so existing keys are preserved.
  if (typeof data.id !== "string" || !data.id.trim()) {
    return { error: 'challenge needs an explicit "id" string (the permanent schedule key)' };
  }
  if (typeof data.prompt !== "string" || !data.prompt.trim()) {
    return { error: 'challenge needs a non-empty "prompt" string' };
  }
  const target = data.target as { program?: unknown } | undefined;
  if (!target || typeof target.program !== "string" || !target.program.trim()) {
    return { error: 'challenge needs a "target": { "program": "..." }' };
  }
  // A tier typo must not be absorbed. `data.tier === "py" ? "py" : "ts"` silently
  // coerced "Py"/"python"/"pyodide" to the DSL tier, and no CI gate could see it:
  // the key check only asks whether `tier` is a KNOWN key, the py-vs-manifest 1:1
  // test filters on `tier === "py"` (so a typo'd fence drops out of the py set
  // and the equality still holds), and the ts branch's degenerate-content guard
  // asserts the starter does NOT solve — which Braket Python satisfies by
  // failing to parse as DSL. The fence shipped and the first learner to click
  // Check got `Your circuit: unknown gate "from"`. Same reasoning as the
  // explicit-id rejection above: refuse it, don't absorb it.
  if (data.tier !== undefined && data.tier !== "ts" && data.tier !== "py") {
    return { error: 'challenge "tier" must be "ts" or "py"' };
  }
  const tier = data.tier === "py" ? "py" : "ts";
  const allowedGates = Array.isArray(data.allowedGates)
    ? (data.allowedGates as unknown[]).filter((g): g is string => typeof g === "string")
    : undefined;
  // allowedGates is ENFORCED by gradeTs only — gradePy grades free-form Python on
  // state-vector equality alone and never sees the whitelist. The widget renders
  // the "Allowed gates: …" caption on every tier, so the combination would show a
  // learner a rule nothing applies to them (and rep-schema would "validate" it by
  // running gradeTs against the AUTHOR's own reference circuit). The grader cannot
  // inspect arbitrary Python for gate use, so close it at the authoring gate.
  if (tier === "py" && allowedGates && allowedGates.length > 0) {
    return {
      error:
        'challenge cannot combine tier:"py" with "allowedGates" — the Python grader ' +
        "compares state vectors and cannot enforce a gate whitelist, so the rule would " +
        "be shown to the learner but never applied",
    };
  }

  const spec: ChallengeSpec = {
    id: data.id,
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
