import { runPython } from "@/lib/pyodide-run";
import { getPyodide, runSerialized } from "@/lib/pyodide-runtime";

jest.mock("@/lib/pyodide-runtime", () => ({
  getPyodide: jest.fn(),
  runSerialized: jest.fn(),
  // The learner-facing prefix is single-sourced from the runtime module (the
  // grader shows the same sentence), so the mock has to carry it too.
  PY_BOOT_FAILURE_PREFIX: jest.requireActual("@/lib/pyodide-runtime")
    .PY_BOOT_FAILURE_PREFIX,
}));
const mockGetPyodide = getPyodide as jest.Mock;
const mockRunSerialized = runSerialized as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPyodide.mockResolvedValue({}); // a booted interpreter (opaque here)
});

describe("runPython", () => {
  it("returns captured stdout on success", async () => {
    mockRunSerialized.mockImplementation(async (_py, _code, onOutput) => {
      onOutput("hello world\n");
    });
    const result = await runPython("print('hello world')");
    // `error` is the ONLY success discriminant — absent means the run succeeded.
    // There used to be a sibling `ok: boolean` no consumer ever read.
    expect(result).toEqual({ output: "hello world\n" });
    expect(result.error).toBeUndefined();
  });

  it("reports the raised error when the code throws", async () => {
    mockRunSerialized.mockRejectedValue(
      new Error("NameError: name 'x' is not defined")
    );
    const result = await runPython("print(x)");
    expect(result.error).toMatch(/NameError/);
  });

  it("preserves any output printed before an exception", async () => {
    mockRunSerialized.mockImplementation(async (_py, _code, onOutput) => {
      onOutput("partial\n");
      throw new Error("boom");
    });
    const result = await runPython("print('partial'); raise Exception('boom')");
    expect(result.error).toBe("boom");
    expect(result.output).toBe("partial\n");
  });

  it("returns a friendly error when Python can't boot", async () => {
    mockGetPyodide.mockRejectedValue(new Error("network down"));
    const result = await runPython("print(1)");
    expect(result.error).toMatch(/couldn't start python/i);
    expect(result.error).toContain("network down");
  });
});
