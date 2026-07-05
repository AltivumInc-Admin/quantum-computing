import { parseDebugCircuit, type DebugCircuitSpec } from "@/lib/debug-circuit-schema";
import { debugTruth, gradeDebug } from "@/lib/debug-circuit-grade";

// The canonical debug Rep: Bell prep with the CNOT wired backwards. With q1
// stuck at |0⟩ the reversed CNOT is a no-op, so the broken circuit leaves q0
// superposed but UNENTANGLED — visibly wrong, one-line fix.
const bellSpec: DebugCircuitSpec = {
  id: "t-debug-bell",
  prompt: "This was meant to prepare the Bell state, but the two qubits never entangle. Fix it.",
  qubits: 2,
  broken: { program: "H 0\nCNOT 1 0" },
  target: { program: "H 0\nCNOT 0 1" },
  allowedGates: ["H", "X", "CNOT"],
  hint: "Which qubit carries the superposition — and which end of the CNOT is the control?",
};

describe("parseDebugCircuit", () => {
  it("parses a full spec", () => {
    const { spec, error } = parseDebugCircuit(JSON.stringify(bellSpec));
    expect(error).toBeUndefined();
    expect(spec).toMatchObject({ id: "t-debug-bell", broken: { program: "H 0\nCNOT 1 0" } });
  });

  const without = (key: keyof DebugCircuitSpec) => {
    const rest: Record<string, unknown> = { ...bellSpec };
    delete rest[key];
    return JSON.stringify(rest);
  };

  it("requires an explicit id — there is no auto-hash for a permanent schedule key", () => {
    expect(parseDebugCircuit(without("id")).error).toMatch(/explicit non-empty "id"/);
  });

  it("requires broken and target programs", () => {
    expect(parseDebugCircuit(without("broken")).error).toMatch(/"broken"/);
    expect(parseDebugCircuit(without("target")).error).toMatch(/"target"/);
  });

  it("rejects malformed JSON", () => {
    expect(parseDebugCircuit("{ nope").error).toMatch(/invalid debug JSON/);
  });
});

describe("debugTruth (author-time gate)", () => {
  it("accepts the canonical Rep and precomputes distinct states", () => {
    const truth = debugTruth(bellSpec);
    expect(truth.error).toBeUndefined();
    expect(truth.n).toBe(2);
  });

  it("rejects a broken circuit that already prepares the target — nothing to fix", () => {
    const truth = debugTruth({
      ...bellSpec,
      broken: { program: "H 0\nCNOT 0 1" }, // identical to target
    });
    expect(truth.error).toMatch(/nothing to fix/);
  });

  it("rejects a broken circuit equal to the target only up to global phase", () => {
    // RX(pi) = -iX: same physical state as X, so there is still nothing to fix.
    const truth = debugTruth({
      ...bellSpec,
      allowedGates: undefined,
      broken: { program: "RX 0 3.141592653589793" },
      target: { program: "X 0" },
    });
    expect(truth.error).toMatch(/nothing to fix/);
  });

  it("rejects a |0…0⟩ target — deleting every gate would solve it for a free card", () => {
    // A plausible "remove the stray gate" authoring: target X 0\nX 0 = I.
    // gradeDebug("") simulates the empty program to |0…0⟩ and would grade
    // solved without the learner ever engaging the bug.
    const truth = debugTruth({
      ...bellSpec,
      allowedGates: undefined,
      broken: { program: "X 0" },
      target: { program: "X 0\nX 0" },
    });
    expect(truth.error).toMatch(/\|0…0⟩ start state/);
    // Same class up to global phase: Z on |0⟩ is identity too.
    expect(
      debugTruth({
        ...bellSpec,
        allowedGates: undefined,
        broken: { program: "X 0" },
        target: { program: "Z 0" },
      }).error
    ).toMatch(/\|0…0⟩ start state/);
  });

  it("rejects slider-bound theta in either program", () => {
    expect(debugTruth({ ...bellSpec, target: { program: "RY 0 theta" } }).error).toMatch(
      /concrete/
    );
    expect(debugTruth({ ...bellSpec, broken: { program: "RY 0 theta" } }).error).toMatch(
      /concrete/
    );
  });

  it("rejects a broken or target circuit that violates the Rep's own allowedGates", () => {
    expect(
      debugTruth({ ...bellSpec, broken: { program: "Z 0" } }).error
    ).toMatch(/allowedGates forbids/);
    expect(
      debugTruth({ ...bellSpec, target: { program: "H 0\nZ 0" } }).error
    ).toMatch(/allowedGates forbids/);
  });

  it("rejects unparseable programs and beyond-cap qubit counts", () => {
    expect(debugTruth({ ...bellSpec, broken: { program: "FLIP 0" } }).error).toMatch(
      /broken circuit is invalid/
    );
    expect(debugTruth({ ...bellSpec, qubits: 30 }).error).toMatch(/qubit limit/);
  });
});

describe("gradeDebug", () => {
  const truth = debugTruth(bellSpec);

  it("solves a correct fix", () => {
    expect(gradeDebug("H 0\nCNOT 0 1", bellSpec, truth)).toMatchObject({ status: "solved" });
  });

  it("solves a fix equal to the target up to global phase", () => {
    const spec: DebugCircuitSpec = {
      ...bellSpec,
      allowedGates: undefined,
      broken: { program: "H 0" },
      target: { program: "X 0" },
    };
    const t = debugTruth(spec);
    // RX(pi) = -iX — same state up to the global -i.
    expect(gradeDebug("RX 0 3.141592653589793", spec, t)).toMatchObject({ status: "solved" });
  });

  it("names the unchanged bug precisely instead of burning the hint", () => {
    const r = gradeDebug(bellSpec.broken.program, bellSpec, truth);
    expect(r.status).toBe("wrong");
    expect(r.message).toMatch(/haven't changed the bug/);
  });

  it("a cosmetic edit that leaves the state broken still counts as unchanged", () => {
    // X 1; X 1 is the identity — the state is still exactly the broken one.
    const r = gradeDebug("H 0\nCNOT 1 0\nX 1\nX 1", bellSpec, truth);
    expect(r.message).toMatch(/haven't changed the bug/);
  });

  it("surfaces the hint for a changed-but-wrong state", () => {
    const r = gradeDebug("H 0\nX 1", bellSpec, truth);
    expect(r.status).toBe("wrong");
    expect(r.message).toBe(bellSpec.hint);
  });

  it("errors (not wrong) on parse failures and disallowed gates", () => {
    expect(gradeDebug("FLIP 0", bellSpec, truth).status).toBe("error");
    expect(gradeDebug("Z 0", bellSpec, truth).status).toBe("error");
    expect(gradeDebug("Z 0", bellSpec, truth).message).toMatch(/isn't allowed/);
  });

  it("re-simulates the references when the learner widens the register", () => {
    // Learner drags in q2 (still |0⟩): H 0; CNOT 0 1 on three qubits is the
    // target state tensor |0⟩ — the fix is still correct at the wider width.
    const spec = { ...bellSpec, allowedGates: undefined };
    const t = debugTruth(spec);
    const r = gradeDebug("H 0\nCNOT 0 1\nX 2\nX 2", spec, t);
    expect(r.status).toBe("solved");
  });

  it("propagates an authoring error as an error verdict", () => {
    const bad = debugTruth({ ...bellSpec, broken: { program: bellSpec.target.program } });
    expect(gradeDebug("H 0", bellSpec, bad).status).toBe("error");
  });
});
