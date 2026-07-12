/**
 * @jest-environment jsdom
 */

// getPyodide boots the runtime in a dedicated worker, self-hosted SAME-ORIGIN
// (/pyodide/), and falls back to the jsdelivr CDN (integrity-pinned bootstrap)
// only if same-origin fails; if BOTH fail it surfaces an actionable remediation
// message. It memoizes the boot in a module-global promise and must clear that
// cache on rejection so a transient failure never bricks the session. Each boot
// attempt gets a FRESH worker; a failed attempt's worker must be terminated.

const LOCAL_JS = "http://localhost/pyodide/pyodide.js";
const CDN_BASE = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";

type Posted = { type: string } & Record<string, unknown>;

class FakeWorker {
  static instances: FakeWorker[] = [];
  /** Per-test script for how "the worker" responds to a boot message. */
  static onBoot: (w: FakeWorker, msg: Posted) => void = (w) => w.emit({ type: "ready" });

  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message: string }) => void) | null = null;
  posted: Posted[] = [];
  terminated = false;

  constructor(public url: string) {
    FakeWorker.instances.push(this);
  }
  postMessage(msg: Posted) {
    this.posted.push(msg);
    if (msg.type === "boot") queueMicrotask(() => FakeWorker.onBoot(this, msg));
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
  bootMsg(): Posted {
    return this.posted[0];
  }
}

function loadRuntime() {
  return require("@/lib/pyodide-runtime") as typeof import("@/lib/pyodide-runtime");
}

beforeEach(() => {
  jest.resetModules();
  FakeWorker.instances = [];
  FakeWorker.onBoot = (w) => w.emit({ type: "ready" });
  (globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
});

describe("getPyodide boot: same-origin first, CDN fallback, actionable error", () => {
  it("boots from same-origin /pyodide/ and never touches the CDN when it succeeds", async () => {
    const { getPyodide } = loadRuntime();
    await getPyodide();

    expect(FakeWorker.instances).toHaveLength(1);
    const boot = FakeWorker.instances[0].bootMsg();
    expect(boot.pyodideJsUrl).toBe(LOCAL_JS);
    expect(boot.indexURL).toBe("http://localhost/pyodide/");
    // Same-origin assets are ours: no integrity pin is sent.
    expect(boot.integrity).toBeUndefined();
    // The qcsim wheel resolves same-origin from the lab's wheel directory.
    expect(String(boot.wheelUrl)).toMatch(
      /^http:\/\/localhost\/lab\/files\/wheels\/qcsim-.*\.whl$/
    );
  });

  it("falls back to the integrity-pinned CDN when the same-origin boot fails", async () => {
    FakeWorker.onBoot = (w) => {
      if (FakeWorker.instances.length === 1) {
        w.emit({ type: "boot-error", message: "same-origin /pyodide/ unavailable" });
      } else {
        w.emit({ type: "ready" });
      }
    };
    const { getPyodide } = loadRuntime();
    await getPyodide();

    expect(FakeWorker.instances).toHaveLength(2);
    // The failed same-origin attempt's worker must not be left running.
    expect(FakeWorker.instances[0].terminated).toBe(true);
    const cdnBoot = FakeWorker.instances[1].bootMsg();
    expect(cdnBoot.pyodideJsUrl).toBe(`${CDN_BASE}pyodide.js`);
    expect(cdnBoot.indexURL).toBe(CDN_BASE);
    // The CDN bootstrap is integrity-pinned (the worker digests it by hand,
    // since importScripts cannot enforce SRI itself).
    expect(String(cdnBoot.integrity)).toMatch(/^sha384-.{10,}/);
  });

  it("throws an actionable message when BOTH origins fail, and clears the cache so a retry re-boots", async () => {
    let down = true;
    FakeWorker.onBoot = (w) => {
      if (down) w.emit({ type: "boot-error", message: "origin down" });
      else w.emit({ type: "ready" });
    };
    const { getPyodide } = loadRuntime();

    await expect(getPyodide()).rejects.toThrow(/this site or the CDN/i);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances.every((w) => w.terminated)).toBe(true);

    // The rejection must NOT be cached: a retry re-boots and can succeed.
    down = false;
    await expect(getPyodide()).resolves.toBeDefined();
    expect(FakeWorker.instances.length).toBeGreaterThanOrEqual(3);
  });

  it("treats a worker-script load failure as a failed boot attempt (terminated, then actionable error)", async () => {
    // The worker never gets to reply; its 'error' event fires instead (e.g.
    // /pyodide.worker.js unreachable). Both attempts fail the same way.
    FakeWorker.onBoot = (w) => w.onerror?.({ message: "importScripts failed" });
    const { getPyodide } = loadRuntime();

    await expect(getPyodide()).rejects.toThrow(/this site or the CDN/i);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances.every((w) => w.terminated)).toBe(true);
  });
});
