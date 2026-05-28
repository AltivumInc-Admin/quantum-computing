# Runnable Notebooks in the Browser (JupyterLite + qcsim) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every curriculum notebook one-click runnable in the browser with zero install and zero AWS account, by shipping a JupyterLite distribution alongside the static site and a `qcsim` shim package that surface-matches the `braket.circuits` API the notebooks actually use.

**Architecture:** A separate `qcsim/` Python package mirrors the Braket namespace (`braket.circuits`, `braket.devices`) but is implemented over NumPy. At build time, `web/jupyterlite-build/` invokes `jupyter lite build` to produce a static JupyterLite distribution in `web/public/lab/`. A startup hook installs the `qcsim` wheel into the Pyodide kernel. Notebooks opt in via a `<!-- browser-runnable -->` marker.

**Tech Stack:** JupyterLite, Pyodide, NumPy (in WASM), Python wheel packaging, Playwright for E2E gating, AWS Amplify static export.

---

## Objective

The first lesson currently requires Python, AWS credentials, the Braket SDK install, and a credit card — a drop-off cliff at lesson zero. After this plan, a learner clicks "Run in Browser" on any notebook link and is dropped into JupyterLab with the notebook pre-loaded and a Pyodide kernel pre-configured with NumPy, Matplotlib, and a transparent `qcsim` shim. Identical notebook source runs locally (real Braket simulator) and in the browser (`qcsim` simulator) without modification.

## Prerequisites

- Python 3.10+ for the build-side JupyterLite tooling (separate venv from the curriculum venv).
- `jupyterlite-core`, `jupyterlite-pyodide-kernel`, `build` (for wheel packaging).
- Node 18+ for Playwright E2E gate.
- Read: `web/src/components/notebook-link.tsx`, `web/src/lib/content.ts`, `amplify.yml`, `lib/circuits/common.py`, a sample notebook (`00-foundations/notebooks/01-first-circuit.ipynb`).
- Decision: wheel host — bundled into `web/public/lab/wheels/` (recommended; no external CDN dependency) vs. served from PyPI.
- Decision: which notebooks to mark `browser-runnable` first (recommend `00-foundations` all five, `02-algorithms` first three).

## Step-by-Step Implementation

1. Audit notebook Braket API usage
   - [ ] 1.1. From repo root: `grep -rh "from braket" --include="*.ipynb" . | sort -u`.
   - [ ] 1.2. Catalog every symbol used (`Circuit`, `LocalSimulator`, gate methods `.h`, `.x`, `.cnot`, `.rx`, `result.measurement_counts`, `result.measurement_probabilities`, etc.).
   - [ ] 1.3. Write the catalog to `qcsim/API.md` — this is the surface qcsim must implement.

2. Create the qcsim package
   - [ ] 2.1. `mkdir -p qcsim/braket/circuits qcsim/braket/devices`.
   - [ ] 2.2. Create namespace `__init__.py` files mirroring `braket.*` so notebooks' existing imports work unchanged.
   - [ ] 2.3. Implement `qcsim/braket/circuits/_circuit.py`:
     - `class Circuit` with `.h(q)`, `.x(q)`, `.y(q)`, `.z(q)`, `.cnot(c,t)`, `.rx(q,θ)`, `.ry(q,θ)`, `.rz(q,θ)`, `.measure_all()`, `.qubit_count`, `.depth`, `__str__`.
     - State stored as `numpy.complex128` ndarray, length `2**n`.
     - Lazy state evolution (build a list of (gate, targets), evaluate at `.run()`).
   - [ ] 2.4. Implement `qcsim/braket/devices/_local.py`:
     - `class LocalSimulator: def run(self, circuit, shots: int) -> Task`.
     - `Task.result()` returns object with `.measurement_counts` (`collections.Counter`) and `.measurement_probabilities`.

3. Test qcsim against real Braket
   - [ ] 3.1. Create `tests/test_qcsim_parity.py` — parameterize 8 known circuits (single-H, Bell, GHZ-3, Grover-3, Deutsch–Jozsa-2, parameterized RY, X-then-measure, identity).
   - [ ] 3.2. For each, run with Braket and qcsim at 1000 shots; assert measurement distributions match within 3-sigma.
   - [ ] 3.3. `pytest tests/test_qcsim_parity.py -v` — all pass.

4. Package qcsim as a wheel
   - [ ] 4.1. Create `qcsim/pyproject.toml`:
     ```toml
     [project]
     name = "qcsim"
     version = "0.1.0"
     dependencies = ["numpy>=1.26"]
     [build-system]
     requires = ["setuptools>=68"]
     build-backend = "setuptools.build_meta"
     [tool.setuptools.packages.find]
     include = ["braket*"]
     ```
   - [ ] 4.2. Build: `cd qcsim && python -m build --wheel`.
   - [ ] 4.3. Output: `qcsim/dist/qcsim-0.1.0-py3-none-any.whl`.

5. Stand up JupyterLite build infrastructure
   - [ ] 5.1. `mkdir -p web/jupyterlite-build/files/wheels web/jupyterlite-build/files/notebooks`.
   - [ ] 5.2. Create `web/jupyterlite-build/requirements.txt`:
     ```
     jupyterlite-core==0.7.6
     jupyterlite-pyodide-kernel==0.7.0
     ```
   - [ ] 5.3. Create `web/jupyterlite-build/jupyter_lite_config.json`:
     ```json
     {
       "LiteBuildConfig": {
         "output_dir": "../public/lab",
         "contents": ["files/notebooks"],
         "extra_http_files": ["files/wheels"]
       }
     }
     ```

6. Build script
   - [ ] 6.1. Create `web/jupyterlite-build/build.sh`:
     ```bash
     #!/usr/bin/env bash
     set -euo pipefail
     cd "$(dirname "$0")"

     python -m venv .venv && source .venv/bin/activate
     pip install -r requirements.txt

     # Copy notebooks namespaced by section
     for section in 00-foundations 01-hardware 02-algorithms 03-quantum-ml 04-quantum-chemistry 05-hybrid-jobs; do
       mkdir -p "files/notebooks/$section"
       cp "../../$section/notebooks/"*.ipynb "files/notebooks/$section/" 2>/dev/null || true
     done

     # Copy the qcsim wheel
     cp ../../qcsim/dist/qcsim-*.whl files/wheels/

     jupyter lite build
     ```
   - [ ] 6.2. `chmod +x web/jupyterlite-build/build.sh`.

7. Kernel-startup hook installs qcsim
   - [ ] 7.1. Create `web/jupyterlite-build/files/startup.py`:
     ```python
     import piplite
     await piplite.install("/wheels/qcsim-0.1.0-py3-none-any.whl")
     ```
   - [ ] 7.2. Create `web/jupyterlite-build/files/overrides.json` so the kernel runs `startup.py` on every new session.

8. Wire JupyterLite into the Amplify build
   - [ ] 8.1. Modify `amplify.yml`:
     ```yaml
     version: 1
     applications:
       - appRoot: web
         frontend:
           phases:
             preBuild:
               commands:
                 - cd .. && python -m pip install build && cd qcsim && python -m build --wheel && cd ../web
                 - bash jupyterlite-build/build.sh
                 - npm ci
             build:
               commands:
                 - npm run build
           artifacts:
             baseDirectory: out
             files:
               - "**/*"
           cache:
             paths:
               - node_modules/**/*
               - web/jupyterlite-build/.cache/**/*
     ```

9. Add the "Run in Browser" UI
   - [ ] 9.1. Modify `web/src/components/notebook-link.tsx`:
     ```tsx
     interface NotebookLinkProps {
       filename: string;
       sectionDir: string;
       browserRunnable?: boolean;
     }
     ```
   - [ ] 9.2. Render two actions side-by-side: existing GitHub link + new "Run in Browser" anchor → `/lab/lab/index.html?path=${sectionDir}/${filename}`.
   - [ ] 9.3. When `browserRunnable === false`, render the run button disabled with tooltip "Requires AWS Braket".
   - [ ] 9.4. Add a discreet "Pyodide · in-browser" badge below the title.
   - [ ] 9.5. Use scoped View Transition on the route change (decorate the anchor with `viewTransitionName`).

10. Front-matter detection
    - [ ] 10.1. Modify `web/src/lib/content.ts:listNotebooks()` to also read the first markdown cell of each `.ipynb` and check for the substring `<!-- browser-runnable -->`.
    - [ ] 10.2. Return `Array<{ filename: string; browserRunnable: boolean }>` instead of `string[]`.
    - [ ] 10.3. Update `web/src/app/learn/[section]/page.tsx` to pass the new shape to `<NotebookLink/>`.

11. Mark notebooks
    - [ ] 11.1. In each notebook's first markdown cell, append `<!-- browser-runnable -->` if its only imports are `braket.circuits`, `braket.devices`, `numpy`, `matplotlib`, `collections`.
    - [ ] 11.2. Leave hardware-bound notebooks (`braket.aws.AwsDevice`) unmarked.

12. Headless E2E gate
    - [ ] 12.1. From `web/`: `npx playwright install chromium`.
    - [ ] 12.2. Create `web/__tests__/jupyterlite-e2e.spec.ts`:
      ```ts
      import { test, expect } from "@playwright/test";
      import { listRunnableNotebooks } from "../scripts/list-runnable-notebooks";

      for (const nb of listRunnableNotebooks()) {
        test(`runs ${nb.path} end-to-end`, async ({ page }) => {
          await page.goto(`http://localhost:3000/lab/lab/index.html?path=${nb.path}`);
          await page.getByRole("menuitem", { name: "Run" }).click();
          await page.getByRole("menuitem", { name: "Run All Cells" }).click();
          await expect(page.locator(".jp-RenderedText.jp-OutputArea-output[data-mime-type='application/vnd.jupyter.stderr']")).toHaveCount(0, { timeout: 120000 });
        });
      }
      ```
    - [ ] 12.3. Create `web/scripts/list-runnable-notebooks.ts` that mirrors the marker detection from step 10.
    - [ ] 12.4. Gate Amplify deploy via a CI check: `npm run build && npm run test:e2e:lab`.

13. Pre-warm hint
    - [ ] 13.1. On `<NotebookLink>` hover, inject `<link rel="prefetch" href="/lab/lab/index.html"/>` once per session.

14. Deploy
    - [ ] 14.1. Open a PR with screenshots of a notebook running in the browser.
    - [ ] 14.2. Verify Amplify preview: open any browser-runnable notebook, run all cells, confirm Bell-state output matches local.
    - [ ] 14.3. Commit: `feat(web): runnable notebooks via JupyterLite + qcsim shim`.

## File & Code Changes

| Action | File Path | Description |
|--------|-----------|-------------|
| Create | `qcsim/braket/__init__.py` | Namespace mirror |
| Create | `qcsim/braket/circuits/__init__.py` | Re-export `Circuit` |
| Create | `qcsim/braket/circuits/_circuit.py` | NumPy state-vector circuit |
| Create | `qcsim/braket/devices/__init__.py` | Re-export `LocalSimulator` |
| Create | `qcsim/braket/devices/_local.py` | LocalSimulator over qcsim |
| Create | `qcsim/pyproject.toml` | Wheel build config |
| Create | `qcsim/API.md` | Supported surface docs |
| Create | `tests/test_qcsim_parity.py` | Parity against Braket |
| Create | `web/jupyterlite-build/requirements.txt` | JupyterLite build deps |
| Create | `web/jupyterlite-build/jupyter_lite_config.json` | JupyterLite config |
| Create | `web/jupyterlite-build/build.sh` | Build orchestrator |
| Create | `web/jupyterlite-build/files/startup.py` | Kernel boot wheel install |
| Create | `web/jupyterlite-build/files/overrides.json` | Run startup.py on new sessions |
| Create | `web/jupyterlite-build/.gitignore` | Ignore .cache, .venv, files/notebooks |
| Create | `web/scripts/list-runnable-notebooks.ts` | Marker scanner for tests |
| Create | `web/__tests__/jupyterlite-e2e.spec.ts` | Playwright run-all-cells |
| Modify | `amplify.yml` | Add wheel build + JupyterLite build phases |
| Modify | `web/src/components/notebook-link.tsx` | Add "Run in Browser" action |
| Modify | `web/src/lib/content.ts` | Detect `<!-- browser-runnable -->` |
| Modify | `web/src/app/learn/[section]/page.tsx` | Pass new shape to NotebookLink |
| Modify | `web/.gitignore` | Ignore `public/lab/` (build artifact) |
| Modify | every safely-runnable `*.ipynb` | Add marker comment |

## Testing & Validation

- **Parity (Python):** `pytest tests/test_qcsim_parity.py -v` — 8 known circuits match Braket within 3-sigma at 1000 shots.
- **Wheel install:** in a clean venv, `pip install qcsim/dist/qcsim-0.1.0-py3-none-any.whl && python -c "from braket.circuits import Circuit; print(Circuit().h(0))"` succeeds.
- **JupyterLite build:** `bash web/jupyterlite-build/build.sh` produces `web/public/lab/index.html`.
- **E2E:** Playwright runs all cells of every marker'd notebook without raising.
- **Manual:** open `/learn/00-foundations`, click Run in Browser on `01-first-circuit.ipynb`, kernel boots in < 10s, all cells run, output matches local.
- **Network audit:** DevTools shows only same-origin static fetches (no third-party API calls).
- **Rollback:** revert `amplify.yml` JupyterLite phase; "Run in Browser" returns 404; GitHub link path remains.

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Notebook crashes in Pyodide kernel | High | High | Playwright E2E gate on every deploy; opt-in `browser-runnable` marker means only audited notebooks expose the button |
| qcsim semantics diverge from Braket | Medium | High | Parity test on 8 circuits; document surface in `qcsim/API.md`; refuse to expand surface without parity test |
| JupyterLite bundle inflates site weight | Medium | Medium | `/lab/` is only fetched when the user clicks Run; pre-fetch on hover; cache wheels in IndexedDB |
| Pyodide cold start >10s | Medium | Medium | Service-worker warm-up on hover; loading UI with progress messages |
| Amplify build time spirals | Medium | Low | Cache `.cache/` and `.venv/`; first build ~2min, cached ~30s |
| Notebooks drift between local repo and `/lab/` | Low | Medium | Rebuild on every deploy; PR template includes a "matches local output" check |
| Wheel format breakage in future Pyodide | Low | Medium | Pin `jupyterlite-pyodide-kernel` version; quarterly upgrade run with parity tests |

## Dependencies & Order of Operations

- Steps 1–4 (qcsim package + parity) are the critical path; no UI work validates without this.
- Step 5–7 (JupyterLite build) requires step 4 (wheel) complete.
- Step 8 (Amplify wiring) can parallelize with step 9 (UI).
- Steps 10–11 (marker detection + marking) parallelize with step 12 (E2E).
- This plan is independent of Plan 1; can run in parallel teams.

## Estimated Effort

- **Complexity:** Medium-to-High
- **Time estimate:** 15–25 working days for one engineer.
- **Files affected:** 16 created, 4 modified, plus per-notebook marker addition.
