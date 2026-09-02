# E2E (Playwright)

Real in-browser smoke tests that drive Chromium against the built static export.
Separate from the Jest unit suite (`npm test`) — these are slower and exercise the
actual deployed surfaces, not mocks. Six specs, documented one section each below.

`_support/instrument.ts` holds the shared harness: `instrument(page, baseURL,
label)` installs the request/response/console/pageerror listeners and returns
`{ external, failed, bootFetches }`, and `assertSameOrigin`,
`assertNoFailedResponses` and `assertBoots` are the assertions over them. The
production literals more than one spec asserts on live there too. Playwright
collects only `*.e2e.ts`, so `_support/` is never picked up as a spec — the same
split `jest.config.ts` uses for `__tests__/_support/`.

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
tier:"py" contribution ban. This spec owns **verdict and namespace semantics**,
on a synthetic spec no lesson ships; coverage of the py Reps that actually reach
learners is `py-reps.e2e.ts`'s job. Loads the fixture page
`/e2e-fixtures/py-challenge` (unlinked, noindex'd, outside the sitemap
allowlist, and mounted `persist={false}` so it never writes qc:\* keys;
deliberately NOT robots-disallowed, since a Disallow would hide the noindex from
crawlers) and drives
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

## `py-reps.e2e.ts`

Covers the other half of the py-tier story: **every shipped `tier:"py"` Rep**,
not a synthetic one. The fixture page `/e2e-fixtures/py-reps` mounts each Rep
from its **real GUIDE fence** (`getPyChallengeFences()`), and the spec drives
each through `Challenge → runPy → gradePy` on real Pyodide — a correct
free-form Braket-Python answer must reach the solved verdict, a wrong-but-valid
one must surface that Rep's own hint (a "wrong" verdict, not an error). All of
it runs on **one** interpreter boot, which the spec asserts: every Rep shares
the `getPyodide()` singleton.

The spec's `CASES` table maps **1:1** to `PY_REP_E2E_IDS` in
`src/lib/py-reps.ts`, and its first test asserts exactly that. That manifest is
the contract three places agree on, so **adding a py Rep is a three-part edit**:

1. author the `qchallenge` fence in the section GUIDE,
2. add its id to `PY_REP_E2E_IDS`,
3. add its case (solution, wrong answer, hint substring) to `CASES` here.

Miss any one and CI fails — `rep-schema.ts` refuses a `tier:"py"` fence whose id
is not manifested, `guide-reps.test.ts` compares the two sets in both
directions, and the case-table test above catches the third.

## `workspace-lab.e2e.ts`

The `/workspace` Lab launcher against the static export. In a build with no
Cognito env the page renders its unconfigured bench — the cockpit and the Lab
are pure localStorage + the build-time manifest, so both are fully present
without an account. The spec asserts an "Open ↗" href is one the manifest
allows, then issues a **`HEAD` for the notebook it names** so the check is
launcher-resolves-to-a-file-that-exists rather than manifest-agrees-with-manifest
(the launcher renders from the same manifest, so the href comparison alone could
only catch a URL-construction bug Jest already covers). It also checks the
header's runnable-notebook count is the honest total.

Deliberately **Pyodide-free and fast** — the heavy kernel path is
`lab-pyodide.e2e.ts`'s job.

## Timeouts

Two knobs, with opposite jobs, and the split is deliberate:

- **`expect.timeout` in `playwright.config.ts` is small (15s).** Every assertion
  that legitimately has to outlast a WASM boot carries its own explicit timeout,
  so the default only ever applies to assertions that resolve instantly when
  they pass — the negative guards (no `Traceback`, no `Couldn't load the
  editor`, no `Your code raised:`). A large default made each of those cost the
  full wait on the way to a red build, twice over under the CI retry. A
  post-hydrate assertion that needs more says `{ timeout: 30_000 }` at the call
  site.
- **`timeout` (the per-test cap) is raised per spec with `test.setTimeout`** so
  each spec's budget exceeds the sum of its own declared waits. Without that a
  late failure surfaces as `Test timeout … exceeded` rather than as the named
  expectation that actually broke. Add a wait to a spec, raise its
  `test.setTimeout` in the same edit.

## Running

The E2E serves the already-built `web/out/`, so build first:

```bash
bash jupyterlite-build/build.sh   # builds the qcsim wheel + lab into public/lab/
npm run build                     # static export -> out/ (copies lab into out/lab/)
npm run test:e2e                  # = npx playwright test, the command CI runs
```

Pass a filename to run one spec (`npm run test:e2e -- workspace-lab.e2e.ts`).
Locally `workers` is 1 and `retries` is 0, so the output reads in order; in CI
both go up (two files at a time, one retry).

`serve.json` (`cleanUrls: false`) is required so `/lab/lab/index.html` is served
verbatim — `serve`'s default cleanUrls 301-redirects it and breaks JupyterLite's
base-URL computation.

In CI this runs in the `build-smoke` job (step **In-browser smoke (Playwright)**),
reusing the artifacts that job already builds.

On a red CI run, download the **`playwright-report`** artifact from the workflow
run: it carries `web/playwright-report/` (open `index.html`) and
`web/test-results/`, which holds the `on-first-retry` trace — open that at
[trace.playwright.dev](https://trace.playwright.dev) or with
`npx playwright show-trace <trace.zip>`. Both are CI-only: locally `retries` is
`0` and the reporter is `list`, so nothing is written. To get a trace from a
local repro, ask for one:

```bash
npx playwright test runnable-editor.e2e.ts --trace on
npx playwright show-report
```
