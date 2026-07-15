import { compileToQasm, QASM_SUBMIT_BYTE_CAP } from "@/lib/compile-qasm";
import { parseProgram, type Program } from "@/components/quantum/qsim-dsl";
import { utf8ByteLength } from "@/lib/utf8";

// The dialect pin: the QPU submit panel's Bell preset is the exact string that
// ran on IQM Garnet (task a6042060, 2026-07-15). The compiler must reproduce
// it byte-for-byte — any drift here is a post-confirm 502 for a real learner.
const BELL_PRESET =
  "OPENQASM 3.0;\nqubit[2] q;\nh q[0];\ncnot q[0], q[1];\nbit[2] c;\nc = measure q;";

describe("compileToQasm", () => {
  it("compiles the Bell program to the exact preset dialect that ran on hardware", () => {
    const result = compileToQasm(parseProgram("H 0\nCNOT 0 1"));
    expect(result).toEqual({ ok: true, qasm: BELL_PRESET, bytes: BELL_PRESET.length });
  });

  it("keeps the submit byte cap mirrored to the lambda", () => {
    expect(QASM_SUBMIT_BYTE_CAP).toBe(7000);
  });

  it("passes parse errors through", () => {
    const result = compileToQasm(parseProgram("FOO 0"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('unknown gate "FOO"');
  });

  it("requires theta for bound rotations and bakes it when given", () => {
    const program = parseProgram("RY 0 theta");
    expect(compileToQasm(program).ok).toBe(false);
    const compiled = compileToQasm(program, Math.PI / 2);
    expect(compiled).toMatchObject({ ok: true });
    if (compiled.ok) expect(compiled.qasm).toContain("ry(1.570796) q[0];");
  });

  it("omits identity gates and trims angle formatting deterministically", () => {
    const compiled = compileToQasm(parseProgram("I 0\nRZ 1 1.5\nRX 0 -0.000000001"));
    expect(compiled).toMatchObject({ ok: true });
    if (compiled.ok) {
      expect(compiled.qasm).not.toContain("i q[");
      expect(compiled.qasm).toContain("rz(1.5) q[1];");
      expect(compiled.qasm).toContain("rx(0) q[0];"); // -0 snapped
    }
  });

  it("compiles GHZ-3 with the register widened to the highest touched qubit", () => {
    const expected =
      "OPENQASM 3.0;\nqubit[3] q;\nh q[0];\ncnot q[0], q[1];\ncnot q[1], q[2];\nbit[3] c;\nc = measure q;";
    const result = compileToQasm(parseProgram("H 0\nCNOT 0 1\nCNOT 1 2"));
    expect(result).toEqual({ ok: true, qasm: expected, bytes: expected.length });
  });

  it("compiles GHZ-4 (the playground's stated qubit ceiling)", () => {
    const result = compileToQasm(parseProgram("H 0\nCNOT 0 1\nCNOT 1 2\nCNOT 2 3"));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.qasm).toBe(
        "OPENQASM 3.0;\nqubit[4] q;\nh q[0];\ncnot q[0], q[1];\ncnot q[1], q[2];\ncnot q[2], q[3];\nbit[4] c;\nc = measure q;",
      );
      expect(result.bytes).toBe(result.qasm.length); // dialect is pure ASCII
    }
  });

  it("honors a 'qubits N' directive wider than any gate touches (bit register must match)", () => {
    const expected = "OPENQASM 3.0;\nqubit[4] q;\nh q[0];\nbit[4] c;\nc = measure q;";
    const result = compileToQasm(parseProgram("qubits 4\nH 0"));
    expect(result).toEqual({ ok: true, qasm: expected, bytes: expected.length });
  });

  it.each([
    ["X", "x"],
    ["Y", "y"],
    ["Z", "z"],
    ["H", "h"],
    ["S", "s"],
    ["T", "t"],
  ])("maps single-qubit gate %s to lowercase '%s'", (dsl, qasm) => {
    const result = compileToQasm(parseProgram(`${dsl} 1`));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.qasm).toContain(`\n${qasm} q[1];\n`);
  });

  it("keeps negative rotation angles negative (sign must survive to hardware)", () => {
    const result = compileToQasm(parseProgram("RX 0 -1.5\nRY 1 -3.141593"));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.qasm).toContain("rx(-1.5) q[0];");
      expect(result.qasm).toContain("ry(-3.141593) q[1];");
    }
  });

  it("rounds angles to 6 decimals and trims trailing zeros (whole numbers stay whole)", () => {
    const result = compileToQasm(parseProgram("RZ 0 0.1234567\nRX 0 2\nRY 0 1.500000"));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.qasm).toContain("rz(0.123457) q[0];"); // rounded, not truncated
      expect(result.qasm).toContain("rx(2) q[0];");
      expect(result.qasm).toContain("ry(1.5) q[0];");
    }
  });

  it("compiles an empty program to a bare 1-qubit header + measure", () => {
    const expected = "OPENQASM 3.0;\nqubit[1] q;\nbit[1] c;\nc = measure q;";
    const empty = compileToQasm(parseProgram(""));
    expect(empty).toEqual({ ok: true, qasm: expected, bytes: expected.length });
    // Comment-only source is the same circuit.
    expect(compileToQasm(parseProgram("# just thinking out loud"))).toEqual(empty);
  });

  it("reports bytes as the exact UTF-8 length of the emitted QASM near the cap", () => {
    // 350 CNOT lines ~ 6.3KB: a realistic worst case sitting just under the
    // 7,000-byte submit cap. bytes must be exactly what the Lambda will count.
    const src = Array.from({ length: 350 }, (_, i) => `CNOT ${i % 2} ${(i % 2) + 1}`).join("\n");
    const result = compileToQasm(parseProgram(src));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.bytes).toBe(utf8ByteLength(result.qasm));
      expect(result.bytes).toBe(Buffer.byteLength(result.qasm, "utf8"));
      expect(result.bytes).toBeLessThanOrEqual(QASM_SUBMIT_BYTE_CAP);
    }
  });

  it("fails loud on a gate the compiler does not know (DSL/compiler drift tripwire)", () => {
    // parseProgram can never produce this today — the point is that if the DSL
    // grows a gate before the compiler learns it, compile fails BEFORE the
    // confirm click instead of Braket rejecting the task after it.
    const drifted: Program = {
      n: 2,
      gates: [{ gate: "SWAP", target: 1, control: 0 }],
      hasTheta: false,
    };
    const result = compileToQasm(drifted);
    expect(result).toEqual({
      ok: false,
      error: 'cannot compile gate "SWAP" to OpenQASM — DSL and compiler have drifted',
    });
  });
});
