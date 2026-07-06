import type { ExpectationSpec } from "@/lib/expectation-schema";
import { parseExpectation } from "@/lib/expectation-schema";
import {
  parseObservable,
  observableLabel,
  expectationTruth,
  gradeExpectation,
  expectationReviewAnswer,
  fmtExpectation,
} from "@/lib/expectation-grade";

const spec = (over: Partial<ExpectationSpec> = {}): ExpectationSpec => ({
  id: "t-expect-1",
  prompt: "What is the expectation?",
  program: "H 0",
  observable: "Z 0",
  ...over,
});

describe("parseExpectation", () => {
  it("parses a full spec and requires id/prompt/program/observable", () => {
    const full = spec({ qubits: 2, hint: "h" });
    expect(parseExpectation(JSON.stringify(full)).spec).toMatchObject(full);
    for (const missing of ["id", "prompt", "program", "observable"] as const) {
      const bad: Record<string, unknown> = { ...spec() };
      delete bad[missing];
      expect(parseExpectation(JSON.stringify(bad)).error).toMatch(new RegExp(`"${missing}"`));
    }
  });
});

describe("parseObservable", () => {
  it("parses single and multi-factor Pauli strings", () => {
    expect(parseObservable("Z 0").factors).toEqual([{ pauli: "Z", qubit: 0 }]);
    expect(parseObservable("Z 0 Z 1").factors).toEqual([
      { pauli: "Z", qubit: 0 },
      { pauli: "Z", qubit: 1 },
    ]);
    expect(parseObservable("x 0 y 2").factors).toEqual([
      { pauli: "X", qubit: 0 },
      { pauli: "Y", qubit: 2 },
    ]);
  });

  it("rejects malformed strings", () => {
    expect(parseObservable("Z").error).toMatch(/odd token count/);
    expect(parseObservable("Q 0").error).toMatch(/unknown Pauli/);
    expect(parseObservable("Z x").error).toMatch(/not a valid qubit/);
    expect(parseObservable("Z 0 X 0").error).toMatch(/appears twice/);
    expect(parseObservable("Z 9").error).toMatch(/beyond the/);
  });

  it("renders subscripted labels", () => {
    expect(observableLabel([{ pauli: "Z", qubit: 0 }, { pauli: "Z", qubit: 1 }])).toBe("⟨Z₀Z₁⟩");
  });
});

describe("expectationTruth — hand-checked physics", () => {
  const value = (s: ExpectationSpec) => expectationTruth(s).truth!.value;

  it("⟨Z⟩ = +1 on |0⟩ and −1 on |1⟩", () => {
    expect(value(spec({ program: "I 0" }))).toBe(1);
    expect(value(spec({ program: "X 0" }))).toBe(-1);
  });

  it("⟨Z⟩ = 0 and ⟨X⟩ = +1 on |+⟩ — the canonical basis-matters pair", () => {
    expect(value(spec({ program: "H 0", observable: "Z 0" }))).toBe(0);
    expect(value(spec({ program: "H 0", observable: "X 0" }))).toBe(1);
  });

  it("⟨Y⟩ = +1 on S|+⟩ = |i⟩", () => {
    expect(value(spec({ program: "H 0\nS 0", observable: "Y 0" }))).toBe(1);
  });

  it("Bell state correlations: ⟨Z₀Z₁⟩ = +1, single-qubit ⟨Z⟩ = 0", () => {
    const bell = "H 0\nCNOT 0 1";
    expect(value(spec({ program: bell, observable: "Z 0 Z 1" }))).toBe(1);
    expect(value(spec({ program: bell, observable: "Z 0" }))).toBe(0);
    expect(value(spec({ program: bell, observable: "Z 1" }))).toBe(0);
  });

  it("a rotated state lands between the poles: ⟨Z⟩ = cos(π/3) = 0.5 after RY(π/3)", () => {
    expect(value(spec({ program: "RY 0 1.0471975511965976" }))).toBe(0.5);
  });

  it("observable on an untouched qubit widens the register (⟨Z₁⟩ on H 0 → +1)", () => {
    const t = expectationTruth(spec({ program: "H 0", observable: "Z 1" })).truth!;
    expect(t.n).toBe(2);
    expect(t.value).toBe(1);
  });

  it("pPlus is (1 + value)/2", () => {
    const t = expectationTruth(spec({ program: "H 0" })).truth!;
    expect(t.pPlus).toBe(0.5);
  });
});

describe("expectationTruth — options and guards", () => {
  it("produces four DISTINCT options containing the truth, deterministically shuffled", () => {
    const a = expectationTruth(spec()).truth!;
    const b = expectationTruth(spec()).truth!;
    expect(a.options).toEqual(b.options); // deterministic per id
    expect(new Set(a.options.map((v) => v.toFixed(2))).size).toBe(4);
    expect(a.options[a.correctIndex]).toBe(a.value);
  });

  it("different ids shuffle differently somewhere in a small family", () => {
    const orders = new Set(
      ["a-1", "a-2", "a-3", "a-4", "a-5", "a-6"].map((id) =>
        expectationTruth(spec({ id })).truth!.options.map((v) => v.toFixed(2)).join(",")
      )
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("distractors cover the canonical misconceptions for the extremes and the middle", () => {
    // v = 1: sign flip −1 present; v = 0: P(+1)-confusion 0.5 present.
    const one = expectationTruth(spec({ program: "I 0" })).truth!;
    expect(one.options.map((v) => v.toFixed(2))).toContain("-1.00");
    const zero = expectationTruth(spec({ program: "H 0" })).truth!;
    expect(zero.options.map((v) => v.toFixed(2))).toContain("0.50");
  });

  it("rejects theta-bound circuits, bad observables, and beyond-cap registers", () => {
    expect(expectationTruth(spec({ program: "RY 0 theta" })).error).toMatch(/concrete/);
    expect(expectationTruth(spec({ observable: "Q 0" })).error).toMatch(/observable is invalid/);
    expect(expectationTruth(spec({ program: "FLIP 0" })).error).toMatch(/circuit is invalid/);
    expect(expectationTruth(spec({ qubits: 30 })).error).toMatch(/qubit/);
  });
});

describe("gradeExpectation + review answer + formatting", () => {
  it("grades by index against the truth", () => {
    const t = expectationTruth(spec()).truth!;
    expect(gradeExpectation(t.correctIndex, t)).toBe(true);
    expect(gradeExpectation((t.correctIndex + 1) % 4, t)).toBe(false);
  });

  it("formats a one-line recall answer with the collapsed program", () => {
    const s = spec({ program: "H 0\nCNOT 0 1", observable: "Z 0 Z 1" });
    const t = expectationTruth(s).truth!;
    expect(expectationReviewAnswer(s, t)).toBe("⟨Z₀Z₁⟩ = 1.00 for `H 0; CNOT 0 1`");
  });

  it("never renders -0.00", () => {
    expect(fmtExpectation(-0)).toBe("0.00");
  });

  it("the revealed P(+1) always matches the P(+1)-confusion trap button exactly", () => {
    // For odd truths, a raw (1+v)/2 can toFixed-round the other way than the
    // grid-settled distractor — printing 0.85 in the reveal under a trap
    // button reading 0.86. pPlus must live on the same display grid.
    // RY(pi/4): <Z> = cos(pi/4) -> 0.71, the exact class that triggered it.
    const t = expectationTruth(spec({ program: "RY 0 0.7853981633974483" })).truth!;
    expect(t.value).toBe(0.71);
    const trap = t.options.find((v) => fmtExpectation(v) === "0.86");
    expect(trap).toBeDefined();
    expect(fmtExpectation(t.pPlus)).toBe("0.86"); // identical string, same grid
  });

  it("a shuffle salt permutes option ORDER only — values and truth unchanged", () => {
    const base = expectationTruth(spec()).truth!;
    const salts = [0, 1, 2, 3, 4, 5].map(
      (n) => expectationTruth(spec(), n).truth!
    );
    for (const t of salts) {
      expect([...t.options].sort()).toEqual([...base.options].sort());
      expect(t.options[t.correctIndex]).toBe(base.value);
    }
    // Some salt in a small family must actually move the correct button.
    expect(new Set(salts.map((t) => t.correctIndex)).size).toBeGreaterThan(1);
  });
});

describe("parseExpectation — qubits guard", () => {
  it("rejects fractional, zero, negative, and string qubits loudly", () => {
    for (const qubits of [2.5, 0, -1, "3", NaN]) {
      const bad = { ...spec(), qubits };
      expect(parseExpectation(JSON.stringify(bad)).error).toMatch(/positive integer/);
    }
  });

  it("accepts a genuine positive integer", () => {
    expect(parseExpectation(JSON.stringify(spec({ qubits: 2 }))).spec?.qubits).toBe(2);
  });
});
