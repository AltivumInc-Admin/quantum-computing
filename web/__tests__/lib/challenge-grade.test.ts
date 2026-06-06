import { gradeTs } from "@/lib/challenge-grade";
import { parseChallenge } from "@/lib/challenge-schema";

const bell = parseChallenge(
  JSON.stringify({
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
});
