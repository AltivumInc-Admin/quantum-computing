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

  it("accepts the two real tiers verbatim", () => {
    expect(parseChallenge(JSON.stringify({ ...JSON.parse(valid), tier: "ts" })).spec!.tier).toBe("ts");
    // py fences carry no allowedGates (see the tier/allowedGates rule below).
    const py = parseChallenge(
      JSON.stringify({ id: "py-1", prompt: "p", target: { program: "H 0" }, tier: "py" })
    );
    expect(py.error).toBeUndefined();
    expect(py.spec!.tier).toBe("py");
  });

  // A tier typo used to be ABSORBED: `data.tier === "py" ? "py" : "ts"` turned
  // "Py"/"python"/"pyodide" into a DSL challenge, and no CI gate could see it —
  // the key check only asks whether `tier` is a known KEY, the py-vs-manifest
  // 1:1 test filters on `tier === "py"` (so a typo'd fence leaves the py set and
  // the equality still holds), and the ts degenerate-content guard asserts the
  // starter does NOT solve, which Braket Python satisfies by failing to parse.
  // The fence shipped and the learner got `unknown gate "from"` on first Check.
  it.each(["Py", "python", "pyodide", "PY", "", null, 3])(
    "refuses an unrecognized tier (%p) instead of silently coercing it to ts",
    (tier) => {
      const { spec, error } = parseChallenge(
        JSON.stringify({ ...JSON.parse(valid), tier })
      );
      expect(spec).toBeUndefined();
      expect(error).toMatch(/tier/i);
    }
  );

  // gradePy grades free-form Python on state-vector equality alone and never
  // reads allowedGates, but the widget renders the "Allowed gates:" caption on
  // every tier — so the pair would show a learner a rule that is never applied
  // to them, while rep-schema "validated" it against the AUTHOR's own circuit.
  it('refuses tier:"py" combined with allowedGates (a rule gradePy cannot enforce)', () => {
    const { spec, error } = parseChallenge(
      JSON.stringify({
        id: "py-gates-1",
        prompt: "p",
        target: { program: "H 0" },
        tier: "py",
        allowedGates: ["H", "CNOT"],
      })
    );
    expect(spec).toBeUndefined();
    expect(error).toMatch(/allowedGates/);
  });

  it('still allows allowedGates on the ts tier, and an empty list on py', () => {
    expect(
      parseChallenge(
        JSON.stringify({
          id: "py-nogates-1",
          prompt: "p",
          target: { program: "H 0" },
          tier: "py",
          allowedGates: [],
        })
      ).error
    ).toBeUndefined();
    expect(parseChallenge(valid).spec!.allowedGates).toEqual(["H", "X", "CNOT"]);
  });
});
