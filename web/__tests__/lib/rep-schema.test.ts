import { validateRep, REP_KINDS, FENCE_TOKENS } from "@/lib/rep-schema";

const reps: Record<string, object> = {
  challenge: {
    kind: "challenge",
    id: "community-t-1",
    prompt: "Prepare |+>.",
    qubits: 1,
    target: { program: "H 0" },
    starter: "",
  },
  predict: {
    kind: "predict",
    id: "community-t-2",
    prompt: "Reachable states?",
    program: "H 0\nCNOT 0 1",
    mode: "nonzero-states",
  },
  blochtarget: {
    kind: "blochtarget",
    id: "community-t-3",
    prompt: "Place |+>.",
    target: { program: "H 0" },
  },
  costestimate: {
    kind: "costestimate",
    id: "community-t-4",
    prompt: "Price it.",
    provider: "IonQ",
    shots: 2000,
  },
  debug: {
    kind: "debug",
    id: "community-t-5",
    prompt: "The Bell prep never entangles. Fix it.",
    qubits: 2,
    broken: { program: "H 0\nCNOT 1 0" },
    target: { program: "H 0\nCNOT 0 1" },
  },
  expect: {
    kind: "expect",
    id: "community-t-6",
    prompt: "What is the expectation of Z on |+>?",
    program: "H 0",
    observable: "Z 0",
  },
};

describe("validateRep", () => {
  it.each(REP_KINDS)("accepts a valid %s Rep and maps its fence token", (kind) => {
    const { rep, error } = validateRep(JSON.stringify(reps[kind]));
    expect(error).toBeUndefined();
    expect(rep!.kind).toBe(kind);
    expect(rep!.fenceToken).toBe(FENCE_TOKENS[kind]);
    expect(JSON.parse(rep!.fenceSource)).not.toHaveProperty("kind");
  });

  it("rejects invalid JSON and unknown kinds", () => {
    expect(validateRep("{nope").error).toMatch(/invalid Rep JSON/);
    expect(validateRep(JSON.stringify({ kind: "quiz", id: "x" })).error).toMatch(/kind/);
  });

  it("requires an explicit id even where the fence parser would auto-hash one", () => {
    const noId = { ...reps.challenge } as Record<string, unknown>;
    delete noId.id;
    expect(validateRep(JSON.stringify(noId)).error).toMatch(/explicit string "id"/);
  });

  it("rejects a challenge whose reference cannot solve itself", () => {
    const bad = { ...reps.challenge, allowedGates: ["X"] }; // reference uses H
    expect(validateRep(JSON.stringify(bad)).error).toMatch(/does not solve itself/);
  });

  it("rejects non-object JSON without throwing (null, scalars, arrays)", () => {
    for (const bad of ["null", "true", "[1,2]", '"rep"']) {
      expect(validateRep(bad).error).toMatch(/single JSON object/);
    }
  });

  it("rejects tier outright — contributions are TS-graded only", () => {
    expect(validateRep(JSON.stringify({ ...reps.challenge, tier: "py" })).error).toMatch(
      /TS-graded only/
    );
    expect(validateRep(JSON.stringify({ ...reps.challenge, tier: "ts" })).error).toMatch(
      /TS-graded only/
    );
  });

  it("rejects unknown/misspelled keys the fence parsers would silently drop", () => {
    expect(
      validateRep(JSON.stringify({ ...reps.blochtarget, tolerence: 10 })).error
    ).toMatch(/unknown key "tolerence"/);
    expect(
      validateRep(
        JSON.stringify({ ...reps.challenge, target: { program: "H 0", solution: "H 0" } })
      ).error
    ).toMatch(/target\.solution/);
  });

  it("rejects zero-effort challenges (untouched editor already solves)", () => {
    // Identity-on-|0⟩ target: an empty editor parses to |0⟩ and Z 0 |0⟩ = |0⟩.
    expect(
      validateRep(
        JSON.stringify({ ...reps.challenge, target: { program: "Z 0" }, prompt: "Do nothing." })
      ).error
    ).toMatch(/untouched editor/);
    // Starter equal to the solution: the answer is pre-filled.
    expect(
      validateRep(JSON.stringify({ ...reps.challenge, starter: "H 0" })).error
    ).toMatch(/untouched editor/);
  });

  it("rejects a top-outcome prediction where every basis state ties (any answer grades correct)", () => {
    expect(
      validateRep(
        JSON.stringify({
          kind: "predict",
          id: "community-coin-1",
          prompt: "Most likely?",
          program: "H 0",
          mode: "top-outcome",
        })
      ).error
    ).toMatch(/every basis state ties/);
  });

  it("caps the Rep size", () => {
    const big = JSON.stringify({ ...reps.predict, hint: "x".repeat(70_000) });
    expect(validateRep(big).error).toMatch(/exceeds/);
  });

  it("rejects ungradeable specs through each kind's real truth kernel", () => {
    expect(
      validateRep(JSON.stringify({ ...reps.predict, program: "RY 0 theta" })).error
    ).toMatch(/concrete/);
    expect(
      validateRep(JSON.stringify({ ...reps.blochtarget, target: { program: "Z 0" } })).error
    ).toMatch(/\|0⟩ start/);
    expect(validateRep(JSON.stringify({ ...reps.costestimate, shots: 30 })).error).toMatch(
      /collide/
    );
    // Debug's own degenerate classes, via the same debugTruth the widget runs:
    expect(
      validateRep(
        JSON.stringify({ ...reps.debug, broken: { program: "H 0\nCNOT 0 1" } })
      ).error
    ).toMatch(/nothing to fix/);
    expect(
      validateRep(
        JSON.stringify({
          ...reps.debug,
          broken: { program: "X 0" },
          target: { program: "X 0\nX 0" },
        })
      ).error
    ).toMatch(/start state/);
  });

  it("rejects unknown broken.* subkeys the debug fence parser would silently drop", () => {
    expect(
      validateRep(
        JSON.stringify({ ...reps.debug, broken: { program: "H 0", programm: "H 0" } })
      ).error
    ).toMatch(/broken\.programm/);
  });

  it("rejects ungradeable expectation specs through expectationTruth", () => {
    expect(
      validateRep(JSON.stringify({ ...reps.expect, program: "RY 0 theta" })).error
    ).toMatch(/concrete/);
    expect(
      validateRep(JSON.stringify({ ...reps.expect, observable: "Z 0 X 0" })).error
    ).toMatch(/appears twice/);
  });
});
