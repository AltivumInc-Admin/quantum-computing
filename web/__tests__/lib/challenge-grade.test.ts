import { gradeTs } from "@/lib/challenge-grade";
import { parseChallenge } from "@/lib/challenge-schema";

const bell = parseChallenge(
  JSON.stringify({
    id: "bell-grade-1",
    prompt: "Prepare the Bell state Φ+.",
    qubits: 2,
    target: { program: "H 0\nCNOT 0 1" },
    allowedGates: ["H", "CNOT"],
    hint: "Entangle after a Hadamard.",
  })
).spec!;

describe("gradeTs", () => {
  it("accepts a circuit that reaches the target state", () => {
    expect(gradeTs("H 0\nCNOT 0 1", bell).status).toBe("solved");
  });

  it("grades on the STATE, not the syntax — accepts an equivalent construction", () => {
    // H on q1 then CNOT(1->0) also yields (|00> + |11>)/sqrt(2).
    expect(gradeTs("H 1\nCNOT 1 0", bell).status).toBe("solved");
  });

  it("reports the solve's circuit size as a skill measurement (gates + qubits)", () => {
    expect(gradeTs("H 0\nCNOT 0 1", bell).metrics).toEqual({ gates: 2, qubits: 2 });
    // A redundant construction that still reaches the state measures MORE gates.
    const four = gradeTs("H 0\nCNOT 0 1\nX 1\nX 1", parseChallenge(
      JSON.stringify({ id: "p-1", prompt: "p", qubits: 2, target: { program: "H 0\nCNOT 0 1" } }),
    ).spec!);
    expect(four.status).toBe("solved");
    expect(four.metrics!.gates).toBe(4);
  });

  it("does not attach metrics to a wrong or errored attempt", () => {
    expect(gradeTs("H 0", bell).metrics).toBeUndefined();
    expect(gradeTs("Z 0", bell).metrics).toBeUndefined(); // disallowed gate → error
  });

  it("rejects a circuit that reaches a different state", () => {
    const r = gradeTs("H 0", bell);
    expect(r.status).toBe("wrong");
    expect(r.message).toMatch(/entangle/i); // surfaces the hint
  });

  it("rejects a disallowed gate by name", () => {
    const r = gradeTs("Y 0", bell);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/Y/);
  });

  it("reports a parse error in the learner's circuit", () => {
    expect(gradeTs("FOO 0", bell).status).toBe("error");
  });

  it("surfaces a friendly error for a negative qubit index instead of throwing", () => {
    // Before the parser hardening, "H -1" parsed clean and simulate() threw an
    // uncaught "Cannot read properties of undefined" on the Check button.
    expect(() => gradeTs("H -1", bell)).not.toThrow();
    expect(gradeTs("H -1", bell).status).toBe("error");
  });

  it("surfaces a friendly error for a garbage index instead of grading silently wrong", () => {
    expect(gradeTs("H 0abc", bell).status).toBe("error");
  });

  it("rejects a challenge whose target uses a slider theta (would grade against the identity)", () => {
    const spec = parseChallenge(
      JSON.stringify({ id: "p-1", prompt: "p", qubits: 1, target: { program: "RY 0 theta" } })
    ).spec!;
    const r = gradeTs("H 0", spec);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/concrete|theta/i);
  });

  it("rejects a challenge whose target circuit is malformed instead of silently grading wrong", () => {
    const spec = parseChallenge(
      JSON.stringify({ id: "p-1", prompt: "p", qubits: 1, target: { program: "FOO 0" } })
    ).spec!;
    expect(gradeTs("H 0", spec).status).toBe("error");
  });

  it("rejects a challenge configured beyond the qubit limit instead of allocating 2**n", () => {
    // Author-only static config (spec.qubits) is unbounded; a typo like qubits:30
    // must degrade to a clear error, not a frozen tab on a 2**30 allocation.
    const spec = parseChallenge(
      JSON.stringify({ id: "p-30", prompt: "p", qubits: 30, target: { program: "H 0" } })
    ).spec!;
    const r = gradeTs("H 0", spec);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/qubit limit|beyond/i);
  });
});
