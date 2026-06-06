import { runPython } from "@/lib/pyodide-run";
import { getPyodide, runSerialized } from "@/lib/pyodide-runtime";

jest.mock("@/lib/pyodide-runtime", () => ({
  getPyodide: jest.fn(),
  runSerialized: jest.fn(),
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
    expect(result).toEqual({ ok: true, output: "hello world\n" });
  });

  it("reports the raised error and is not ok when the code throws", async () => {
    mockRunSerialized.mockRejectedValue(
      new Error("NameError: name 'x' is not defined")
    );
    const result = await runPython("print(x)");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/NameError/);
  });

  it("preserves any output printed before an exception", async () => {
    mockRunSerialized.mockImplementation(async (_py, _code, onOutput) => {
      onOutput("partial\n");
      throw new Error("boom");
    });
    const result = await runPython("print('partial'); raise Exception('boom')");
    expect(result.ok).toBe(false);
    expect(result.output).toBe("partial\n");
  });

  it("returns a friendly error when Python can't boot", async () => {
    mockGetPyodide.mockRejectedValue(new Error("network down"));
    const result = await runPython("print(1)");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/couldn't start python/i);
  });
});
