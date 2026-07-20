import { gradePy } from "@/lib/pyodide-grader";
import { gradeTs } from "@/lib/challenge-grade";
import { getPyodide, runSerialized } from "@/lib/pyodide-runtime";
import { parseChallenge, type ChallengeSpec } from "@/lib/challenge-schema";

// Mirror the pyodide-run.test.ts seam: the runtime is browser-only, so unit
// tests mock it. runSerialized stands in for the worker — it returns whatever
// JSON the "interpreter" would have produced. That lets us (a) exercise gradePy's
// verdict logic against canned state vectors and (b) inspect the exact program
// gradePy builds, which is where the namespace-isolation guarantee lives.
jest.mock("@/lib/pyodide-runtime", () => {
  class PythonTimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PythonTimeoutError";
    }
  }
  class PythonRuntimeError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PythonRuntimeError";
    }
  }
  return {
    getPyodide: jest.fn(),
    runSerialized: jest.fn(),
    PythonTimeoutError,
    PythonRuntimeError,
  };
});

const { PythonTimeoutError, PythonRuntimeError } = jest.requireMock("@/lib/pyodide-runtime");
const mockGetPyodide = getPyodide as jest.Mock;
const mockRunSerialized = runSerialized as jest.Mock;

const bellSpec: ChallengeSpec = {
  id: "t",
  prompt: "Prepare the Bell state.",
  target: { program: "H 0\nCNOT 0 1" },
  starter: "",
  hint: "Entangle after a Hadamard.",
  tier: "py",
};

const S = Math.SQRT1_2;
const BELL = JSON.stringify([
  [S, 0],
  [0, 0],
  [0, 0],
  [S, 0],
]);
const ZERO2 = JSON.stringify([
  [1, 0],
  [0, 0],
  [0, 0],
  [0, 0],
]);

/** The single program gradePy handed the runtime on its most recent call. */
function lastProgram(): string {
  return mockRunSerialized.mock.calls.at(-1)![1] as string;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPyodide.mockResolvedValue({}); // an opaque booted interpreter
});

describe("gradePy — verdicts", () => {
  it("returns solved when the learner state matches the reference up to global phase", async () => {
    mockRunSerialized.mockResolvedValue(BELL);
    const r = await gradePy("circuit = ...", bellSpec);
    expect(r.status).toBe("solved");
    expect(r.message).toMatch(/verified against the reference state vector/i);
  });

  it("returns wrong (with the spec hint) when the state does not match", async () => {
    mockRunSerialized.mockResolvedValue(ZERO2);
    const r = await gradePy("circuit = ...", bellSpec);
    expect(r.status).toBe("wrong");
    expect(r.message).toBe("Entangle after a Hadamard.");
  });

  it("surfaces a Python exception under 'Your code raised:' (a real error, not a wrong answer)", async () => {
    mockRunSerialized.mockRejectedValue(
      new Error("Traceback ...\nNameError: name 'circuit' is not defined")
    );
    const r = await gradePy("answer = 42", bellSpec);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/^Your code raised:/);
    expect(r.message).toMatch(/name 'circuit' is not defined/);
  });

  it("shows a watchdog timeout message verbatim — never misattributed as a raised exception", async () => {
    mockRunSerialized.mockRejectedValue(
      new PythonTimeoutError("Execution stopped after 30 seconds, so the Python environment was reset.")
    );
    const r = await gradePy("while True: pass", bellSpec);
    expect(r.status).toBe("error");
    expect(r.message).toBe(
      "Execution stopped after 30 seconds, so the Python environment was reset."
    );
    expect(r.message).not.toMatch(/Your code raised:/);
  });

  it("reports a friendly message when Python can't boot", async () => {
    mockGetPyodide.mockRejectedValue(new Error("network down"));
    const r = await gradePy("circuit = ...", bellSpec);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/couldn't start python/i);
    expect(mockRunSerialized).not.toHaveBeenCalled();
  });

  // A learner circuit CAN reach a non-finite state through ordinary content:
  // qcsim's rotation gates take any float with no domain check, so
  // `circuit.ry(0, np.arcsin(x))` with |x| > 1 (angle encoding — the exact
  // subject of the shipped qml-angle-encode-py-1 Rep) yields nan amplitudes.
  // The harness used to json.dumps those at allow_nan=True, emitting a bare
  // `NaN` token; JSON.parse then threw INSIDE the same try as the run, so the
  // learner was told "Your code raised: Unexpected token 'N'..." — a Python
  // exception they never raised.
  it("reports a non-finite amplitude as a teachable error, not as a raised exception", async () => {
    mockRunSerialized.mockResolvedValue(JSON.stringify({ __grader_error: "non-finite" }));
    const r = await gradePy("circuit = Circuit().ry(0, np.arcsin(2.0))", bellSpec);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/non-finite amplitude/i);
    expect(r.message).toMatch(/arcsin/i); // names the actual cause
    expect(r.message).not.toMatch(/Your code raised:/);
  });

  // The worst outcome this grader can produce is a FALSE PASS, and non-finite
  // amplitudes are how one gets in: statesApproxEqual compares with
  // `Math.abs(x - y) > eps`, and every comparison against NaN is false, so an
  // all-NaN vector reports EQUAL to any target. JSON cannot carry NaN, but it
  // carries Infinity via an overflowing literal (1e400) — so the guard has to
  // hold on the decoded value, not just on the encoder.
  it("never grades a non-finite state as solved (the false-pass this guard exists for)", async () => {
    // 1e400 decodes to Infinity; the rest of the vector matches the Bell target.
    mockRunSerialized.mockResolvedValue("[[1e400,0],[0,0],[0,0],[1e400,0]]");
    const r = await gradePy("circuit = ...", bellSpec);
    expect(r.status).not.toBe("solved");
    expect(r.status).toBe("error");
  });

  it("reports an undecodable payload as a grader fault, never as the learner's exception", async () => {
    mockRunSerialized.mockResolvedValue("[[NaN, 0.0],[0.0,0.0]]"); // not valid JSON
    const r = await gradePy("circuit = ...", bellSpec);
    expect(r.status).toBe("error");
    expect(r.message).not.toMatch(/Your code raised:/);
    expect(r.message).not.toMatch(/Unexpected token/);
    expect(r.message).toMatch(/couldn't read your circuit's state vector/i);
  });

  it("rejects a learner state that exceeds the in-browser qubit cap", async () => {
    // 2**5 amplitudes -> 5 qubits, beyond MAX_QUBITS (4): bounded before a 2**n
    // reference allocation.
    mockRunSerialized.mockResolvedValue(JSON.stringify(Array.from({ length: 32 }, () => [0, 0])));
    const r = await gradePy("circuit = ...", bellSpec);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/beyond the .* limit/i);
  });
});

// Reference-target validation used to be a byte-identical copy in each grader,
// and both prior fixes to it (the hasTheta guard, the MAX_QUBITS cap) had to be
// applied twice. Each tier asserted its own copy in its own suite, so neither
// suite would have failed if one tier lost a guard. These cases pin the two
// tiers to ONE answer, which is the property the shared resolveTarget buys.
describe("reference-target validation is identical across both tiers", () => {
  const specWith = (target: string, qubits?: number): ChallengeSpec =>
    parseChallenge(
      JSON.stringify({ id: "x-1", prompt: "p", qubits, target: { program: target } })
    ).spec!;

  it.each([
    ["a malformed target", "FOO 0"],
    ["a slider-bound theta target", "RY 0 theta"],
  ])("agrees on %s — same status and the same learner-facing message", async (_n, target) => {
    const spec = { ...specWith(target), tier: "py" as const };
    mockRunSerialized.mockResolvedValue(BELL);

    const py = await gradePy("circuit = ...", spec);
    const ts = gradeTs("H 0\nCNOT 0 1", { ...spec, tier: "ts" });

    expect(py.status).toBe("error");
    expect(ts.status).toBe("error");
    expect(py.message).toBe(ts.message);
  });

  // The ONE thing the two tiers deliberately do NOT share is where the grading
  // WIDTH comes from, which is why resolveTarget takes it as a parameter:
  // gradeTs folds in the authored spec.qubits, gradePy uses the width the
  // learner's Python actually produced (spec.qubits is not a bound on what
  // Pyodide returns). A `qubits: 30` typo is therefore caught for BOTH tiers at
  // the authoring gate — rep-schema runs gradeTs over the author's own target —
  // and gradePy still caps on the learner's real width (see the case above).
  it("derives the grading width per tier: authored qubits for ts, the learner's state for py", async () => {
    const spec = { ...specWith("H 0", 30), tier: "py" as const };
    mockRunSerialized.mockResolvedValue(BELL); // 4 amplitudes -> 2 qubits

    expect(gradeTs("H 0", { ...spec, tier: "ts" }).message).toMatch(/beyond the .* limit/i);
    expect((await gradePy("circuit = ...", spec)).status).toBe("wrong");
  });
});

describe("gradePy — namespace isolation (grading integrity)", () => {
  // A hostile submission tries to reach the extraction: redefine the readout
  // builtins/modules and pre-seed the result the grader would compute.
  const HOSTILE = [
    "circuit = None",
    '__grader_dumps = lambda *a, **k: "[[1,0],[0,0],[0,0],[1,0]]"',
    "float = None",
    'import sys; sys.modules["json"] = None',
  ].join("\n");

  it("passes the learner source only as an isolated data literal, never as sibling code", async () => {
    mockRunSerialized.mockResolvedValue(BELL);
    await gradePy(HOSTILE, bellSpec);
    const program = lastProgram();

    // The learner crosses into Python exactly once, JSON-encoded, as the argument
    // to the harness — and runs inside its own dict via exec().
    expect(program).toContain(JSON.stringify(HOSTILE));
    expect(program).toContain("exec(__grader_src, __grader_ns)");
    expect(program).toContain("__grader_ns.get('circuit')");
    expect(program).toMatch(/__grader_extract\(".*"\)\s*$/s);

    // With the isolated data channel removed, NONE of the hostile statements
    // remain as executable code — the shape a naive `${source}\n<epilogue>`
    // concatenation would leave behind (and this test would then fail).
    const withoutData = program.replace(JSON.stringify(HOSTILE), '"<SRC>"');
    expect(withoutData).not.toContain("float = None");
    expect(withoutData).not.toContain("__grader_dumps = lambda");
    expect(withoutData).not.toContain('sys.modules["json"]');
  });

  it("builds an extraction harness that is byte-identical regardless of learner input", async () => {
    // The ONLY thing that may vary between two grades is the embedded data
    // literal; the extraction logic is a constant, so learner content has no
    // path into it.
    const skeleton = (program: string, src: string) =>
      program.replace(JSON.stringify(src), "<SRC>");

    mockRunSerialized.mockResolvedValue(BELL);
    await gradePy("from braket.circuits import Circuit\ncircuit = Circuit().h(0)", bellSpec);
    const benign = skeleton(lastProgram(), "from braket.circuits import Circuit\ncircuit = Circuit().h(0)");

    await gradePy(HOSTILE, bellSpec);
    const hostile = skeleton(lastProgram(), HOSTILE);

    expect(hostile).toBe(benign);
  });

  it("captures the readout callables as default-argument locals (immune to later shadowing/monkeypatch)", async () => {
    mockRunSerialized.mockResolvedValue(BELL);
    await gradePy("circuit = ...", bellSpec);
    const program = lastProgram();
    // json.dumps and numpy.real/imag are bound as defaults BEFORE the learner
    // runs, so the extraction never re-reads a name the learner could reach.
    expect(program).toContain("__grader_dumps=__grader_json.dumps");
    expect(program).toContain("__grader_real=__grader_np.real");
    expect(program).toContain("__grader_imag=__grader_np.imag");
    expect(program).toContain("__grader_as_float=float");
    // The finiteness check is captured the same way, so a learner cannot shadow
    // math.isfinite to smuggle a nan state past the guard.
    expect(program).toContain("__grader_isfinite=__grader_math.isfinite");
  });

  it("can never emit invalid JSON: non-finite is a typed sentinel, and allow_nan is off", async () => {
    mockRunSerialized.mockResolvedValue(BELL);
    await gradePy("circuit = ...", bellSpec);
    const program = lastProgram();
    // The backstop: default json.dumps writes a bare `NaN` token, which is not
    // JSON at all — the client's JSON.parse threw and the failure was reported
    // as the learner's own exception.
    expect(program).toContain("allow_nan=False");
    expect(program).toContain("__grader_error");
  });
});

describe("gradePy — lifecycle failures are not the learner's exception", () => {
  it("shows a worker-crash message verbatim, never prefixed with 'Your code raised:'", async () => {
    // A dead/crashed worker rejects with PythonRuntimeError. Prefixing it as a
    // learner exception blames them for an environment failure they cannot act
    // on -- the same class of misattribution as the JSON-decode bug.
    mockRunSerialized.mockRejectedValueOnce(
      new PythonRuntimeError("The Python runtime crashed. Run again to restart it.")
    );
    const result = await gradePy("circuit = ...", bellSpec);
    expect(result.status).toBe("error");
    expect(result.message).toBe("The Python runtime crashed. Run again to restart it.");
    expect(result.message).not.toMatch(/Your code raised/);
  });
});
