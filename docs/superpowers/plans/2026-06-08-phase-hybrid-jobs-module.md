# 06-hybrid-jobs Module Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Reflow `06-hybrid-jobs/GUIDE.md` into a production capstone narrative and add four widgets (qjob, qparam, qcheckpoint, qmetrics) built on the already-tested `hybrid.ts` + reused `cost.ts`/`chemistry.ts`/`h2-data.ts`.

**Tech Stack:** Next.js 16 static export, React 19, Tailwind v4, Jest.

---

## Foundations (DONE — committed `1948b5c`)
- `hybrid.ts` + `hybrid.test.ts` (11 tests, green): `INSTANCES`, `standaloneWallClockSec`, `hybridWallClockSec`, `qpuCost`, `instanceCost`, `jobTotalCost`, `paramTimeNaive/Reused/SavedSec`, `wastedNoCheckpoint`, `wastedWithCheckpoint`.
- Reusable: `cost.ts` (`PRICING`, `Provider`), `chemistry.ts` (`h2OneQubit`, `oneQubitHamiltonian`, `vqeGradientDescent`, `energy1q`, `exactGround`), `h2-data.ts` (`H2`).

## Shared conventions (ALL components)
Follow `qaoa-explorer.tsx` / `vqc-trainer.tsx` exactly: `"use client"`; ALL hooks before any early return; pure `parseSource` → `{ok:true,...}|{ok:false,error}` (empty → sensible default, JSON.parse in try/catch); widget-specific `ErrorCard` with prefix (`qjob error:` etc.) using the shared card classes; every SVG `role="img"` + live-number `aria-label`, decorative text `aria-hidden`; sliders `useId`+`aria-label`+`aria-valuetext` in physical units; `motion-reduce:*` on animations; `tabular-nums` + token colors (no hex); NO emojis; no AWS/SSR calls. Each component's visible header is the exact string given below (routing test matches it). Build agents do NOT edit markdown-renderer.tsx and do NOT run git.

---

## Task 1: `qjob` — standalone vs Hybrid Job
**Create** `web/src/components/quantum/job-explorer.tsx` (export `JobExplorer`), header **"Standalone vs Hybrid Job"**, error prefix `qjob error:`.
Fence body (optional): `{ "iterations": 60, "shots": 1000, "provider": "IonQ", "instance": "ml.m5.large", "queueWaitSec": 45, "iterSec": 6 }`; empty → those defaults.
- State: sliders for iterations, queueWaitSec, iterSec; selects for provider (cost.ts per-shot providers) and instance (`INSTANCES`).
- Compute: standalone wall-clock `standaloneWallClockSec`, cost `qpuCost` (no instance). Hybrid wall-clock `hybridWallClockSec(n, startupSec≈60, iterSec)`, cost `jobTotalCost(provider, instance, n, shots, hybridWallClock)`.
- Render two compared bars/cards: wall-clock (format mm:ss or hours) and total cost ($) for each, plus the delta ("priority access saves X; the instance adds $Y"). Label queue wait as an "illustrative" estimate.

## Task 2: `qparam` — parametric compilation savings
**Create** `web/src/components/quantum/param-compile-explorer.tsx` (export `ParamCompileExplorer`), header **"Parametric compilation"**, prefix `qparam error:`.
Fence (optional): `{ "iterations": 50, "compileSec": 8, "runSec": 2 }`; empty → defaults.
- Sliders: iterations, compileSec, runSec. Compute `paramTimeNaive` vs `paramTimeReused`, saved = `paramSavedSec`.
- Render: two timelines/bars (recompile-every vs compile-once), the saved seconds + percent, and a one-line note citing that Braket compiles a `FreeParameter` circuit once and reuses it (transpiled/superconducting QPUs).

## Task 3: `qcheckpoint` — fault-tolerant sweep
**Create** `web/src/components/quantum/checkpoint-explorer.tsx` (export `CheckpointExplorer`), header **"Checkpointing"**, prefix `qcheckpoint error:`.
Fence (optional): `{ "iterations": 40, "failAt": 27, "every": 10 }`; empty → defaults. (Iterations conceptually a bond-length sweep; you may reference `H2.points.length` as a realistic default count but clamp inputs.)
- State: failAt slider, checkpoint-every slider. Compute `wastedNoCheckpoint(failAt)` vs `wastedWithCheckpoint(failAt, every)`.
- Render: a horizontal timeline of N iterations with checkpoint tick marks (every `every`), a failure marker at `failAt`, and a shaded "redone on restart" region for each strategy; readout of iterations wasted + the saving.

## Task 4: `qmetrics` — live convergence dashboard
**Create** `web/src/components/quantum/metrics-explorer.tsx` (export `MetricsExplorer`), header **"Live job metrics"**, prefix `qmetrics error:`.
Fence (optional): `{ "R": 0.74, "threshold": -1.13 }`; empty → equilibrium R, sensible threshold.
- Use `h2OneQubit(R, H2.points)` → `oneQubitHamiltonian` → `vqeGradientDescent(H, [start], lr, steps)` to get an energy `history`. Plot energy vs iteration (a `log_metric` stream) in an SVG; a horizontal `stopping_condition` threshold line; a "Run"/"stream" button that reveals points iteration-by-iteration (reduced motion → show all). Label axes (iteration, energy Ha). Caption: this is what `log_metric` → CloudWatch shows during a job.

---

## Task 5: Renderer wiring + routing tests (controller, serial)
- [ ] In `markdown-renderer.tsx`: add 4 imports after `import { PesExplorer } ...` and 4 `pre()` branches after the `language-qpes` branch (`qjob|qparam|qcheckpoint|qmetrics`).
- [ ] In `markdown-renderer.fence-routing.test.tsx`: 4 routing tests using exact headers: "Standalone vs Hybrid Job", "Parametric compilation", "Checkpointing", "Live job metrics".
- [ ] Run full `npx jest`; fix header matches.

## Task 6: GUIDE reflow (controller, inline)
- [ ] Keep H1 `# Production Hybrid Quantum-Classical Jobs`. Add a captivating intro (drives landing summary).
- [ ] Reflow into: take-VQE-to-production → when to use a job (embed `qjob`) → architecture/priority access → parametric compilation (embed `qparam`, keep `qscrub`) → lifecycle + hyperparameters/metrics (embed `qmetrics`) → checkpointing (embed `qcheckpoint`) → custom containers → cost management → PennyLane/CUDA-Q → a curriculum-closing send-off.
- [ ] Fix prereq line: "Completed: 00 through 04" → "Completed: 00 through 05".
- [ ] Preserve verbatim: objectives, prereqs (renumbered), 7 notebooks (accurate descriptions), algorithms/containers, all references. No emojis.

## Task 7: Docs + verify + PR (controller)
- [ ] `python scripts/validate_runnable.py --write-manifest`; confirm no drift.
- [ ] `cd web && npx jest` (all green), `npm run lint`, `npm run build` (11 pages); `cd .. && pytest -q` (unchanged).
- [ ] Sync `CLAUDE.md` web test count.
- [ ] Commit; push; open PR `feat(web): 06-hybrid-jobs overhaul — production capstone + qjob/qparam/qcheckpoint/qmetrics`. Merge after CI + approval.

## Self-Review
- All 4 widgets + prereq fix covered. hybrid.ts done/tested. Headers are unique exact strings. qmetrics reuses verified chemistry.ts. Honesty: cost rates real, queue/compile times labeled illustrative.
