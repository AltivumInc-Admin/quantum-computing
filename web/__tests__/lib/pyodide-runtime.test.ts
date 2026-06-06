import { runSerialized } from "@/lib/pyodide-runtime";

// A controllable fake of the Pyodide interpreter for exercising runSerialized's
// orchestration (serialization + fresh namespace + stdout capture) without WASM.
function makeFakePy() {
  let stdoutSink: (s: string) => void = () => {};
  const namespaces: Array<{ destroyed: boolean }> = [];
  const py = {
    loadPackage: jest.fn(),
    setStdout: jest.fn(({ batched }: { batched: (s: string) => void }) => {
      stdoutSink = batched;
    }),
    setStderr: jest.fn(),
    toPy: jest.fn(() => {
      const ns = {
        destroyed: false,
        destroy() {
          ns.destroyed = true;
        },
      };
      namespaces.push(ns);
      return ns;
    }),
    runPythonAsync: jest.fn(async () => "default"),
    emit: (s: string) => stdoutSink(s),
    namespaces,
  };
  return py;
}

describe("runSerialized", () => {
  it("returns the value the interpreter produces", async () => {
    const py = makeFakePy();
    py.runPythonAsync.mockResolvedValue("RESULT");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await runSerialized(py as any, "1 + 1")).toBe("RESULT");
  });

  it("captures stdout into the onOutput sink", async () => {
    const py = makeFakePy();
    py.runPythonAsync.mockImplementation(async () => {
      py.emit("hello\n");
      return undefined;
    });
    const out: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runSerialized(py as any, "print('hello')", (t) => out.push(t));
    expect(out.join("")).toBe("hello\n");
  });

  it("runs each call in a fresh namespace and destroys it", async () => {
    const py = makeFakePy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runSerialized(py as any, "a = 1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runSerialized(py as any, "b = 2");
    expect(py.toPy).toHaveBeenCalledTimes(2);
    expect(py.runPythonAsync.mock.calls[0][1]).toHaveProperty("globals");
    expect(py.namespaces.every((n) => n.destroyed)).toBe(true);
  });

  it("serializes overlapping runs so they never interleave", async () => {
    const py = makeFakePy();
    let release!: (v: unknown) => void;
    py.runPythonAsync
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r;
          })
      )
      .mockImplementationOnce(async () => "second");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p1 = runSerialized(py as any, "first");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p2 = runSerialized(py as any, "second");
    await Promise.resolve();
    await Promise.resolve();

    expect(py.runPythonAsync).toHaveBeenCalledTimes(1); // second is still queued
    release(undefined);
    await p1;
    await p2;
    expect(py.runPythonAsync).toHaveBeenCalledTimes(2);
  });
});
