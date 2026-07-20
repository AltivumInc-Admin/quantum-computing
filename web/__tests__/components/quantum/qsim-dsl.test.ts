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
    expect(p.gates[0].theta).toBeCloseTo(1.5708, 4);
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

  it("rejects a negative qubit index instead of crashing simulate()", () => {
    const p = parseProgram("H -1");
    expect(p.error).toMatch(/target qubit/i);
    expect(p.gates).toHaveLength(0);
  });

  it("rejects a garbage index that parseInt would silently truncate", () => {
    // parseInt("0abc") === 0, which would build a wrong-but-silent circuit.
    expect(parseProgram("H 0abc").error).toMatch(/target qubit/i);
    expect(parseProgram("H 2x").error).toMatch(/target qubit/i);
  });

  it("rejects a negative or trailing-garbage index on CNOT", () => {
    expect(parseProgram("CNOT -1 0").error).toMatch(/control and a target/i);
    expect(parseProgram("CNOT 0 1x").error).toMatch(/control and a target/i);
  });

  // Extra whole tokens were the one malformed-input class the parser accepted
  // silently, building a wrong circuit from a natural typo — and because the
  // grader can only report "wrong" when there is no parse error, the learner
  // was told their physics was wrong when their syntax had been truncated.
  it("rejects a single-qubit gate carrying an extra qubit", () => {
    // 'H 0 1' reads as "H on qubits 0 and 1"; it used to build H on qubit 0.
    const p = parseProgram("H 0 1");
    expect(p.error).toMatch(/extra token "1"/);
    expect(p.gates).toHaveLength(0);
  });

  it("rejects a CNOT carrying a third qubit (a Toffoli attempt)", () => {
    expect(parseProgram("CNOT 0 1 2").error).toMatch(/extra token "2"/);
  });

  it("rejects a rotation carrying a token after its angle", () => {
    expect(parseProgram("RY 0 theta 42").error).toMatch(/extra token "42"/);
    expect(parseProgram("RZ 0 1.57 x").error).toMatch(/extra token "x"/);
  });

  it("rejects an over-long qubits directive", () => {
    expect(parseProgram("qubits 2 3").error).toMatch(/extra token "3"/);
  });

  it("still accepts every shipped instruction shape at exact arity", () => {
    const p = parseProgram("qubits 2\nH 0\nCNOT 0 1\nRY 1 theta\nRX 0 1.5708");
    expect(p.error).toBeUndefined();
    expect(p.gates).toHaveLength(4);
  });

  it("rejects a garbage angle that parseFloat would truncate", () => {
    expect(parseProgram("RY 0 1.5xyz").error).toMatch(/bad angle/i);
  });

  it("still accepts a valid negative rotation angle", () => {
    const p = parseProgram("RX 0 -1.5708");
    expect(p.error).toBeUndefined();
    expect(p.gates[0].theta).toBeCloseTo(-1.5708, 4);
  });

  it("accepts leading-zero indices", () => {
    const p = parseProgram("H 03");
    expect(p.error).toBeUndefined();
    expect(p.gates[0]).toEqual({ gate: "H", target: 3 });
  });

  it("rejects a non-numeric `qubits` directive", () => {
    expect(parseProgram("qubits x\nH 0").error).toMatch(/qubits directive/i);
  });

  it("rejects CNOT with equal control and target", () => {
    const p = parseProgram("CNOT 0 0");
    expect(p.error).toMatch(/must differ/i);
    expect(p.gates).toHaveLength(0);
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
