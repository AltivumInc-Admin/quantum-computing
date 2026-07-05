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
  });
});
