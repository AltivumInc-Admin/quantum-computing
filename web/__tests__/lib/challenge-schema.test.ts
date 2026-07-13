import { parseChallenge } from "@/lib/challenge-schema";

const valid = JSON.stringify({
  id: "bell-1",
  prompt: "Prepare the Bell state.",
  qubits: 2,
  target: { program: "H 0\nCNOT 0 1" },
  starter: "H 0",
  allowedGates: ["H", "X", "CNOT"],
  hint: "Entangle after a Hadamard.",
});

describe("parseChallenge", () => {
  it("parses a well-formed challenge", () => {
    const { spec, error } = parseChallenge(valid);
    expect(error).toBeUndefined();
    expect(spec!.prompt).toBe("Prepare the Bell state.");
    expect(spec!.target.program).toContain("CNOT 0 1");
    expect(spec!.allowedGates).toEqual(["H", "X", "CNOT"]);
  });

  it("defaults the grading tier to 'ts'", () => {
    expect(parseChallenge(valid).spec!.tier).toBe("ts");
  });

  it("uses the explicit id verbatim (the permanent schedule key)", () => {
    expect(parseChallenge(valid).spec!.id).toBe("bell-1");
  });

  it("errors when the id is missing — no silent fallback key", () => {
    const { error } = parseChallenge(
      JSON.stringify({ prompt: "x", target: { program: "H 0" } })
    );
    expect(error).toMatch(/id/i);
  });

  it("errors when the prompt is missing", () => {
    const { error } = parseChallenge(
      JSON.stringify({ id: "x-1", target: { program: "H 0" } })
    );
    expect(error).toMatch(/prompt/i);
  });

  it("errors when the target program is missing", () => {
    const { error } = parseChallenge(JSON.stringify({ id: "x-1", prompt: "x" }));
    expect(error).toMatch(/target/i);
  });

  it("errors on invalid JSON", () => {
    expect(parseChallenge("{ not json").error).toBeTruthy();
  });
});
