// Parse + validate the JSON inside a ```qexpect fenced block.
//
// An expectation-value Rep shows a CONCRETE circuit and a Pauli-string
// observable, and asks the learner to commit to the value of ⟨ψ|P|ψ⟩ before
// the reveal — the primitive every variational algorithm (VQE energy terms,
// QML cost functions) is built from, which is what finally gives the
// variational modules (04-quantum-ml / 05-quantum-chemistry / 06-hybrid-jobs)
// a graded Rep that drills their actual skill instead of a shoehorned
// fixed-circuit build. `id` is REQUIRED — it is the permanent `expect:<id>`
// schedule key, never auto-hashed.
//
// The observable grammar is deliberately tiny and DSL-flavored: whitespace-
// separated PAULI-qubit pairs, e.g. "Z 0", "Z 0 Z 1", "X 0 Y 2". Each qubit
// may appear at most once (a Pauli string is one factor per site).

export interface ExpectationSpec {
  id: string;
  prompt: string;
  program: string;
  observable: string;
  qubits?: number;
  hint?: string;
}

export interface ParsedExpectation {
  spec?: ExpectationSpec;
  error?: string;
}

export function parseExpectation(source: string): ParsedExpectation {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(source);
  } catch (e) {
    return { error: `invalid expectation JSON: ${(e as Error).message}` };
  }

  if (typeof data.id !== "string" || !data.id.trim()) {
    return { error: 'expectation needs an explicit non-empty "id" (it is the permanent schedule key)' };
  }
  if (typeof data.prompt !== "string" || !data.prompt.trim()) {
    return { error: 'expectation needs a non-empty "prompt" string' };
  }
  if (typeof data.program !== "string" || !data.program.trim()) {
    return { error: 'expectation needs a "program" — the concrete circuit preparing the state' };
  }
  if (typeof data.observable !== "string" || !data.observable.trim()) {
    return { error: 'expectation needs an "observable" — a Pauli string like "Z 0" or "Z 0 Z 1"' };
  }
  // Loud, not lax: a fractional/zero qubits would render "2.5 qubits" in the
  // register chip, and a string "3" silently shrinking the register is worse.
  if (
    data.qubits !== undefined &&
    (typeof data.qubits !== "number" || !Number.isInteger(data.qubits) || data.qubits < 1)
  ) {
    return { error: 'expectation "qubits" must be a positive integer when present' };
  }

  const spec: ExpectationSpec = {
    id: data.id,
    prompt: data.prompt,
    program: data.program,
    observable: data.observable,
    qubits: data.qubits as number | undefined,
    hint: typeof data.hint === "string" ? data.hint : undefined,
  };
  return { spec };
}
