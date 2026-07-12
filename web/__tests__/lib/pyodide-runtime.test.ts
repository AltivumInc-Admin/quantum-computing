/**
 * @jest-environment jsdom
 */

// runSerialized orchestration against the WORKER-hosted runtime: result
// passthrough, output routing, run serialization, and the watchdog timeout
// (kill -> learner-facing PythonTimeoutError -> queued runs reject -> the next
// getPyodide() boots a FRESH worker). The worker itself is faked at the
// postMessage/onmessage boundary; the real worker + real Pyodide execution is
// proven end-to-end by web/e2e/challenge-py-grader.e2e.ts and
// web/e2e/py-grader-timeout.e2e.ts.

type Posted = { type: string; id?: number; code?: string } & Record<string, unknown>;

/** Scriptable stand-in for the /pyodide.worker.js worker. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  /** Per-test scripts for how "the worker" responds to boot/run messages. */
  static onBoot: (w: FakeWorker, msg: Posted) => void = (w) => w.emit({ type: "ready" });
  static onRun: (w: FakeWorker, msg: Posted) => void = () => {};

  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message: string }) => void) | null = null;
  posted: Posted[] = [];
  terminated = false;

  constructor(public url: string) {
    FakeWorker.instances.push(this);
  }
  postMessage(msg: Posted) {
    this.posted.push(msg);
    // Reply asynchronously, like a real worker.
    if (msg.type === "boot") queueMicrotask(() => FakeWorker.onBoot(this, msg));
    if (msg.type === "run") queueMicrotask(() => FakeWorker.onRun(this, msg));
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
  runs(): Posted[] {
    return this.posted.filter((m) => m.type === "run");
  }
}

function loadRuntime() {
  return require("@/lib/pyodide-runtime") as typeof import("@/lib/pyodide-runtime");
}

beforeEach(() => {
  jest.resetModules();
  FakeWorker.instances = [];
  FakeWorker.onBoot = (w) => w.emit({ type: "ready" });
  FakeWorker.onRun = () => {};
  (globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
});

describe("runSerialized (worker-hosted)", () => {
  it("boots the static worker asset and resolves with the value the run produces", async () => {
    FakeWorker.onRun = (w, msg) => w.emit({ type: "result", id: msg.id, value: "RESULT" });
    const { getPyodide, runSerialized } = loadRuntime();
    const py = await getPyodide();
    await expect(runSerialized(py, "1 + 1")).resolves.toBe("RESULT");
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].url).toBe("/pyodide.worker.js");
    expect(FakeWorker.instances[0].runs()[0].code).toBe("1 + 1");
  });

  it("streams output messages into the onOutput sink, in order", async () => {
    FakeWorker.onRun = (w, msg) => {
      w.emit({ type: "output", id: msg.id, text: "hello\n" });
      w.emit({ type: "output", id: msg.id, text: "world\n" });
      w.emit({ type: "result", id: msg.id, value: undefined });
    };
    const { getPyodide, runSerialized } = loadRuntime();
    const py = await getPyodide();
    const out: string[] = [];
    await runSerialized(py, "print('hello'); print('world')", (t) => out.push(t));
    expect(out.join("")).toBe("hello\nworld\n");
  });

  it("rejects with the worker-reported Python error message", async () => {
    FakeWorker.onRun = (w, msg) =>
      w.emit({ type: "error", id: msg.id, message: "NameError: name 'x' is not defined" });
    const { getPyodide, runSerialized } = loadRuntime();
    const py = await getPyodide();
    await expect(runSerialized(py, "print(x)")).rejects.toThrow(/NameError/);
  });

  it("serializes overlapping runs so they never interleave", async () => {
    FakeWorker.onRun = () => {}; // replies driven manually below
    const { getPyodide, runSerialized } = loadRuntime();
    const py = await getPyodide();
    const w = FakeWorker.instances[0];

    const p1 = runSerialized(py, "first");
    const p2 = runSerialized(py, "second");
    await Promise.resolve();
    await Promise.resolve();

    // The second run must still be queued client-side, not posted to the worker.
    expect(w.runs()).toHaveLength(1);
    w.emit({ type: "result", id: w.runs()[0].id, value: "one" });
    await expect(p1).resolves.toBe("one");
    await Promise.resolve();
    expect(w.runs()).toHaveLength(2);
    w.emit({ type: "result", id: w.runs()[1].id, value: "two" });
    await expect(p2).resolves.toBe("two");
  });

  it("kills the worker on timeout with the learner-facing message, and reboots fresh", async () => {
    FakeWorker.onRun = () => {}; // never replies: an infinite loop
    const rt = loadRuntime();
    rt.__setRunTimeoutMsForTests(20);
    const py = await rt.getPyodide();
    const first = FakeWorker.instances[0];

    const hung = rt.runSerialized(py, "while True: pass");
    await expect(hung).rejects.toThrow(rt.PythonTimeoutError);
    await expect(hung).rejects.toThrow(/shut down and reset/);
    await expect(hung).rejects.toThrow(/infinite loop/);
    // The ONLY interrupt without SharedArrayBuffer is terminating the worker.
    expect(first.terminated).toBe(true);

    // The dead handle refuses further runs with an explicit reset message...
    await expect(rt.runSerialized(py, "print(1)")).rejects.toThrow(
      /reset because an earlier run timed out/
    );

    // ...and the module cache was invalidated: the next boot is a NEW worker
    // that runs normally (the killed-then-rebooted runtime still works).
    FakeWorker.onRun = (w, msg) => w.emit({ type: "result", id: msg.id, value: "alive" });
    const py2 = await rt.getPyodide();
    expect(py2).not.toBe(py);
    expect(FakeWorker.instances).toHaveLength(2);
    await expect(rt.runSerialized(py2, "2 + 2")).resolves.toBe("alive");
  });

  it("rejects runs queued behind a timed-out run instead of posting them to the dead worker", async () => {
    FakeWorker.onRun = () => {};
    const rt = loadRuntime();
    rt.__setRunTimeoutMsForTests(20);
    const py = await rt.getPyodide();
    const w = FakeWorker.instances[0];

    const p1 = rt.runSerialized(py, "while True: pass");
    const p2 = rt.runSerialized(py, "print('queued')");
    await expect(p1).rejects.toThrow(rt.PythonTimeoutError);
    await expect(p2).rejects.toThrow(/reset because an earlier run timed out/);
    // The queued run was never posted to the terminated worker.
    expect(w.runs()).toHaveLength(1);
  });
});
