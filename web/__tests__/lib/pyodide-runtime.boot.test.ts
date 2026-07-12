/**
 * @jest-environment jsdom
 */

// getPyodide self-hosts the runtime SAME-ORIGIN (/pyodide/) and falls back to the
// jsdelivr CDN only if same-origin fails; if BOTH fail it surfaces an actionable
// remediation message. It memoizes the boot in a module-global promise and must
// clear that cache on rejection so a transient failure never bricks the session.

const LOCAL_JS = "/pyodide/pyodide.js";
const CDN_JS = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js";

function injectScript(src: string) {
  // Pre-inject so the internal loadScript()'s querySelector short-circuits and
  // resolves immediately (jsdom never fires <script> onload over the network).
  const s = document.createElement("script");
  s.src = src;
  document.head.appendChild(s);
}

function fakePyodide() {
  return {
    loadPackage: jest.fn().mockResolvedValue(undefined),
    runPythonAsync: jest.fn().mockResolvedValue(undefined),
  };
}

function indexURLs(loadPyodide: jest.Mock): string[] {
  return loadPyodide.mock.calls.map((c) => (c[0] as { indexURL: string }).indexURL);
}

describe("getPyodide boot: same-origin first, CDN fallback, actionable error", () => {
  beforeEach(() => {
    jest.resetModules();
    document.head.innerHTML = "";
    delete (window as unknown as { loadPyodide?: unknown }).loadPyodide;
  });

  it("boots from same-origin /pyodide/ and never touches the CDN when it succeeds", async () => {
    injectScript(LOCAL_JS);
    const fakePy = fakePyodide();
    const loadPyodide = jest.fn().mockResolvedValue(fakePy);
    (window as unknown as { loadPyodide: unknown }).loadPyodide = loadPyodide;

    const { getPyodide } = require("@/lib/pyodide-runtime");
    await expect(getPyodide()).resolves.toBe(fakePy);
    // Only the same-origin index was used; the CDN was never attempted.
    expect(indexURLs(loadPyodide)).toEqual(["/pyodide/"]);
  });

  it("falls back to the SRI'd CDN when the same-origin runtime fails", async () => {
    injectScript(LOCAL_JS);
    injectScript(CDN_JS);
    const fakePy = fakePyodide();
    const loadPyodide = jest
      .fn()
      .mockRejectedValueOnce(new Error("same-origin /pyodide/ unavailable"))
      .mockResolvedValue(fakePy);
    (window as unknown as { loadPyodide: unknown }).loadPyodide = loadPyodide;

    const { getPyodide } = require("@/lib/pyodide-runtime");
    await expect(getPyodide()).resolves.toBe(fakePy);
    // Same-origin attempted first, then the CDN fallback.
    expect(indexURLs(loadPyodide)).toEqual([
      "/pyodide/",
      "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/",
    ]);
  });

  it("throws an actionable message when BOTH origins fail, and clears the cache so a retry re-boots", async () => {
    injectScript(LOCAL_JS);
    injectScript(CDN_JS);
    const fakePy = fakePyodide();
    const loadPyodide = jest
      .fn()
      .mockRejectedValueOnce(new Error("same-origin down"))
      .mockRejectedValueOnce(new Error("cdn down"))
      .mockResolvedValue(fakePy); // a later retry can succeed
    (window as unknown as { loadPyodide: unknown }).loadPyodide = loadPyodide;

    const { getPyodide } = require("@/lib/pyodide-runtime");
    await expect(getPyodide()).rejects.toThrow(/this site or the CDN/i);
    // The rejection must NOT be cached: a retry re-boots (both origins again).
    await expect(getPyodide()).resolves.toBe(fakePy);
    // 2 failed (1st call) + at least 1 more (2nd call) — proves the cache cleared.
    expect(loadPyodide.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("removes a failed bootstrap <script> so a retry re-fetches instead of wedging on the dead tag", async () => {
    // Simulate the network at the <script> level: appended scripts fire 'error'
    // while "down", 'load' once "recovered". (jsdom never fires these itself.)
    let networkUp = false;
    const realAppend = document.head.appendChild.bind(document.head);
    const appendSpy = jest
      .spyOn(document.head, "appendChild")
      .mockImplementation((node: unknown) => {
        const el = realAppend(node as Node);
        const n = node as HTMLElement;
        if (n.tagName === "SCRIPT") {
          queueMicrotask(() => n.dispatchEvent(new Event(networkUp ? "load" : "error")));
        }
        return el;
      });

    const fakePy = fakePyodide();
    const loadPyodide = jest.fn().mockResolvedValue(fakePy);
    (window as unknown as { loadPyodide: unknown }).loadPyodide = loadPyodide;

    const { getPyodide } = require("@/lib/pyodide-runtime");

    // Round 1 — network down: both origins' scripts fire onerror -> actionable error.
    await expect(getPyodide()).rejects.toThrow(/this site or the CDN/i);
    // The dead tags MUST have been removed; otherwise the querySelector
    // short-circuit makes every retry resolve without re-fetching (the wedge).
    expect(document.querySelectorAll("script").length).toBe(0);

    // Round 2 — network recovers: the retry must re-append fresh scripts and boot.
    networkUp = true;
    await expect(getPyodide()).resolves.toBe(fakePy);

    appendSpy.mockRestore();
  });
});
