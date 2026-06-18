/**
 * @jest-environment jsdom
 */

// getPyodide memoizes the boot in a module-global promise. If the first boot
// rejects (CDN blip / wheel 404), the cache must be cleared so a retry re-boots
// instead of returning the same rejected promise forever (which would brick every
// runnable cell + the grader for the rest of the session).

const PYODIDE_JS = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js";

describe("getPyodide boot cache", () => {
  beforeEach(() => {
    jest.resetModules();
    document.head.innerHTML = "";
    // Pre-inject the runtime <script> so the internal loadScript() short-circuits
    // (its querySelector finds it) and never touches the real network.
    const s = document.createElement("script");
    s.src = PYODIDE_JS;
    document.head.appendChild(s);
  });

  it("re-boots after a failed boot instead of caching the rejection forever", async () => {
    const fakePy = {
      loadPackage: jest.fn().mockResolvedValue(undefined),
      runPythonAsync: jest.fn().mockResolvedValue(undefined),
    };
    const loadPyodide = jest
      .fn()
      .mockRejectedValueOnce(new Error("CDN blip"))
      .mockResolvedValue(fakePy);
    (window as unknown as { loadPyodide: unknown }).loadPyodide = loadPyodide;

    const { getPyodide } = require("@/lib/pyodide-runtime");

    await expect(getPyodide()).rejects.toThrow("CDN blip");
    // The rejection must NOT be cached: a retry re-boots and succeeds.
    await expect(getPyodide()).resolves.toBe(fakePy);
    expect(loadPyodide).toHaveBeenCalledTimes(2);
  });
});
