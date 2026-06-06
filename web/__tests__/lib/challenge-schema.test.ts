import { parseChallenge } from "@/lib/challenge-schema";

const valid = JSON.stringify({
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

  it("derives a stable id from the prompt when none is given", () => {
    const a = parseChallenge(valid).spec!.id;
    const b = parseChallenge(valid).spec!.id;
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("errors when the prompt is missing", () => {
    const { error } = parseChallenge(JSON.stringify({ target: { program: "H 0" } }));
    expect(error).toMatch(/prompt/i);
  });

  it("errors when the target program is missing", () => {
    const { error } = parseChallenge(JSON.stringify({ prompt: "x" }));
    expect(error).toMatch(/target/i);
  });

  it("errors on invalid JSON", () => {
    expect(parseChallenge("{ not json").error).toBeTruthy();
  });
});
