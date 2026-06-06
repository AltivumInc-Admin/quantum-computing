import { parseProgram, opsFor, MAX_QUBITS } from "@/components/quantum/qsim-dsl";

describe("parseProgram (shared qsim gate DSL)", () => {
  it("parses a single gate and infers one qubit", () => {
    const p = parseProgram("H 0");
    expect(p.error).toBeUndefined();
    expect(p.n).toBe(1);
    expect(p.gates).toEqual([{ gate: "H", target: 0 }]);
  });

  it("infers qubit count from the highest index used", () => {
    expect(parseProgram("CNOT 0 1").n).toBe(2);
    expect(parseProgram("H 2").n).toBe(3);
  });

  it("honors an explicit `qubits` directive", () => {
    expect(parseProgram("qubits 3\nH 0").n).toBe(3);
  });

  it("binds a `theta` rotation to the slider", () => {
    const p = parseProgram("RY 0 theta");
    expect(p.hasTheta).toBe(true);
    expect(p.gates[0]).toEqual({ gate: "RY", target: 0, bound: true });
  });

  it("parses a literal rotation angle", () => {
    const p = parseProgram("RX 0 1.5708");
    expect(p.gates[0]).toMatchObject({ gate: "RX", target: 0 });
    expect(p.gates[0].angle).toBeCloseTo(1.5708, 4);
  });

  it("ignores blank lines and # comments", () => {
    const p = parseProgram("# a comment\n\nH 0\n");
    expect(p.gates).toHaveLength(1);
  });

  it("reports an error for an unknown gate", () => {
    expect(parseProgram("FOO 0").error).toMatch(/unknown gate/i);
  });

  it("rejects circuits wider than MAX_QUBITS", () => {
    expect(parseProgram(`H ${MAX_QUBITS}`).error).toMatch(/qubits/i);
  });
});

describe("opsFor (binds slider theta into the op list)", () => {
  it("substitutes the live theta for a bound rotation", () => {
    const p = parseProgram("RY 0 theta");
    const ops = opsFor(p, 1.23);
    expect(ops[0]).toEqual({ gate: "RY", target: 0, theta: 1.23 });
  });

  it("passes a CNOT through with its control", () => {
    const ops = opsFor(parseProgram("CNOT 0 1"), 0);
    expect(ops[0]).toEqual({ gate: "CNOT", target: 1, control: 0 });
  });
});
