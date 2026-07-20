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

## `challenge-py-grader.e2e.ts`

Proves the Tier-B grading path end-to-end — the browser verification
`pyodide-grader.ts`'s header asks for, and the evidence behind `rep-schema.ts`'s
tier:"py" contribution ban. Loads the fixture page
`/e2e-fixtures/py-challenge` (the only mount of a tier:"py" challenge — unlinked,
noindex'd, outside the sitemap allowlist, and mounted `persist={false}` so it
never writes qc:\* keys; deliberately NOT robots-disallowed, since a Disallow
would hide the noindex from crawlers) and drives
`Challenge → runPy → gradePy` on real Pyodide + the real qcsim wheel: a correct
free-form Braket-Python solution must produce the grader's exact solved literal,
a wrong-but-valid one must surface the spec's hint (not an error), and a
submission that never binds `circuit` must error — proving `runSerialized`'s
fresh-namespace guard, since the solved run's `circuit` would otherwise stand in.
Like the lab spec, it asserts the whole flow makes **zero third-party requests**
(Pyodide from the self-hosted `/pyodide/`, the wheel from `/lab/files/wheels/`).

The lesson runtime executes learner Python in a **dedicated worker**
(`/pyodide.worker.js`, a static asset — see `src/lib/pyodide-runtime.ts`), so
this spec's network assertions also pin down that worker-originated requests
(the wasm boot, the wheel install) stay same-origin.

## `runnable-editor.e2e.ts`

Covers the inline ```runnable fence (01-foundations' live Python sandbox), which
had no browser coverage at all: `__tests__/components/code-editor.test.tsx` mocks
`@monaco-editor/react` wholesale, and `__tests__/components/runnable-editor.test.tsx`
substitutes a plain `<textarea>` for `CodeEditor`, so **nothing** exercised the
Monaco self-hosting migration. Loads `/e2e-fixtures/runnable-editor` and proves
the real path: Monaco boots from the self-hosted, version-stamped
`/monaco/<version>/vs` and becomes editable, the fence source runs on the shared
worker-hosted Pyodide runtime + the real qcsim wheel (the Bell amplitudes come
back), a **typed edit** reaches Python (proving the editor's model, not the
seeded `source` prop, is what executes), and Reset restores the fence.

Two guards ride along: zero third-party requests (Monaco must never regress to
`@monaco-editor/loader`'s jsdelivr default) and **no failed same-origin
response** — which is what makes `scripts/stage-monaco.mjs`'s unreachable-asset
filter (the ts/css/html/json language-service workers and the localized
`nls.messages` bundles, ~10 MB the Python-only editor can never reach) safe: if
the editor ever did ask for a dropped file it surfaces here as a 404.

## `py-grader-timeout.e2e.ts`

Proves the worker watchdog on the same fixture page (loaded with
`?timeoutMs=2000`, which the fixture's `TimeoutOverride` feeds to the runtime's
test-only setter): an infinite-loop submission must be **killed** — the worker
terminated, the learner shown the full reset message (never "Your code
raised:") — and a correct solution submitted immediately afterwards must grade
to the exact solved literal on a **fresh** runtime. Asserts exactly TWO
interpreter boots (the kill really discarded the first interpreter) and, like
the other specs, zero third-party requests. Kept separate from
`challenge-py-grader.e2e.ts` because that spec's fresh-namespace proof is
premised on a single boot.

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
