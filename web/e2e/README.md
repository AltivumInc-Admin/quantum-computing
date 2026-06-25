# E2E (Playwright)

Real in-browser smoke tests that drive Chromium against the built static export.
Separate from the Jest unit suite (`npm test`) — these are slower and exercise the
actual deployed surfaces, not mocks.

## `lab-pyodide.e2e.ts`

Loads the JupyterLite lab at the exact URL the site links to, runs a
browser-runnable notebook under **real Pyodide + the real qcsim wheel**, and asserts
the deterministic stdout (`Qubit count: 1` / `Circuit depth: 1`). This covers what
`__tests__/lib/pyodide-runtime.test.ts` (jsdom-mocked) and the Python
`tests/test_notebook_contract.py` (CPython qcsim) cannot: the actual browser kernel
path and the local-wheel install contract.

The lab is **fully same-origin**: `build.sh` self-hosts the kernel's Pyodide
distribution under `/lab/static/pyodide/` (via `PyodideAddon`'s well-known path) and
bundles both the qcsim and `comm` wheels into the local piplite index (`PipliteAddon`,
with `disablePyPIFallback`). The spec therefore also **asserts zero third-party
requests** — a regression guard against the kernel ever again booting Pyodide from
cdn.jsdelivr.net or fetching `comm` from pypi.org (the two runtime SPOFs this
replaced). Because there is no network dependency, the run is deterministic; the
single CI retry is just CPU-contention insurance.

## Running

The E2E serves the already-built `web/out/`, so build first:

```bash
bash jupyterlite-build/build.sh   # builds the qcsim wheel + lab into public/lab/
npm run build                     # static export -> out/ (copies lab into out/lab/)
npm run test:e2e                  # playwright test
```

`serve.json` (`cleanUrls: false`) is required so `/lab/lab/index.html` is served
verbatim — `serve`'s default cleanUrls 301-redirects it and breaks JupyterLite's
base-URL computation.

On failure, see `playwright-report/` (HTML) and the on-first-retry trace. In CI this
runs in the `build-smoke` job, reusing the artifacts it already builds.
