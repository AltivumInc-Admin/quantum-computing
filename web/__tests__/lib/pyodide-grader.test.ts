import { gradePy } from "@/lib/pyodide-grader";
import { getPyodide, runSerialized } from "@/lib/pyodide-runtime";
import type { ChallengeSpec } from "@/lib/challenge-schema";

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
  return { getPyodide: jest.fn(), runSerialized: jest.fn(), PythonTimeoutError };
});

const { PythonTimeoutError } = jest.requireMock("@/lib/pyodide-runtime");
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

  it("rejects a learner state that exceeds the in-browser qubit cap", async () => {
    // 2**5 amplitudes -> 5 qubits, beyond MAX_QUBITS (4): bounded before a 2**n
    // reference allocation.
    mockRunSerialized.mockResolvedValue(JSON.stringify(Array.from({ length: 32 }, () => [0, 0])));
    const r = await gradePy("circuit = ...", bellSpec);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/beyond the .* limit/i);
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
  });
});
