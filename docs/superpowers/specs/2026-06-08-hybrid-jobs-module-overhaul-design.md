# 06-hybrid-jobs Module Overhaul — Design

**Date:** 2026-06-08
**Status:** Approved (design + scope: 4 widgets + prereq fix)
**Module:** `06-hybrid-jobs` (the final curriculum module; web GUIDE lesson only)

## Goal

Transform `06-hybrid-jobs/GUIDE.md` from a dry, list-heavy ops reference into a
captivating capstone narrative with four interactive widgets, closing the
curriculum by taking the module-05 VQE into production.

## Through-Line

*Take the VQE you built in module 05 and run it for real.* Four pillars, four
moments: **decide** a job is worth it → **speed up** the inner loop → **survive**
failure → **watch** it converge. This deliberately reuses module 05's H2 data and
`chemistry.ts`, closing the arc.

## AWS facts (verified against current docs)

- Tasks submitted from within a Hybrid Job get **priority QPU queue access**
  (developerguide/braket-hybrid-job-decorator.html). Custom-container tasks carry
  `AMZN_BRAKET_JOB_TOKEN` so they are billed/queued as job tasks, not standalone.
- **Parametric compilation** compiles a `FreeParameter` circuit once and reuses it
  across iterations — "dramatic" runtime improvement on transpiled/superconducting
  QPUs (developerguide/braket-jobs-parametric-compilation.html).
- **Checkpointing** (`save_job_checkpoint`/`load_job_checkpoint`) + metrics
  (`log_metric`) are real helper functions (braket-jobs-concepts.html).
- Job runs in a managed container on EC2; results → S3, metrics/logs → CloudWatch.

## Honesty framing

These widgets MODEL AWS behavior. Cost **rates** are real (reuse `cost.ts`
PRICING; add representative SageMaker ML on-demand instance rates, labeled
"representative, check current pricing"). Queue-wait and per-circuit compile times
are user-adjustable **illustrative** sliders, clearly labeled as estimates. No
live AWS calls — pure client, static-export safe.

## Widgets

Follow the established conventions (rules-of-hooks, SVG `role=img`+`aria-label`,
slider a11y, `motion-reduce`, `tabular-nums`, token colors, no emojis). Each gets
a routing test; the cost/time logic lives in a unit-tested `hybrid.ts`.

### 1. `qjob` — standalone vs Hybrid Job (decide; keystone)
Set iterations N, shots/iter, illustrative per-iteration queue wait, per-iteration
compute time, provider, instance type. Compare **standalone** (each iteration a
separate task waiting in the general queue: wall-clock ≈ N·(queueWait + iterTime),
QPU cost only) vs **Hybrid Job** (priority, back-to-back: wall-clock ≈ startup +
N·iterTime, QPU cost + instance·hours). Shows the trade: a small instance charge
buys a large wall-clock reduction.

### 2. `qparam` — parametric compilation savings
Set N parameter updates, per-circuit compile time, per-run time. Compare
recompile-every-iteration (N·(compile+run)) vs compile-once (compile + N·run);
show time saved = (N−1)·compile. Cite the AWS parametric-compilation doc.

### 3. `qcheckpoint` — fault-tolerant sweep
A bond-length VQE sweep as a job (reuse module 05's `H2.points`). Inject a failure
at iteration k; compare restart-from-scratch (wasted = k iterations redone) vs
resume-from-checkpoint every c (wasted = k − ⌊k/c⌋·c). Timeline with checkpoint
marks, failure mark, and shaded wasted region per strategy.

### 4. `qmetrics` — live monitoring dashboard
Stream a real VQE convergence: `chemistry.ts` `vqeGradientDescent` on the H2
1-qubit Hamiltonian, energy vs iteration like a `log_metric` → CloudWatch stream,
with a `stopping_condition` threshold line. Reuses the verified module-05 kernel.

## New kernel: `web/src/components/quantum/hybrid.ts`
Pure arithmetic, reusing `cost.ts` PRICING:
- `INSTANCES` (representative ML on-demand $/hr) + `InstanceType`.
- `standaloneWallClockSec(n, queueWaitSec, iterSec)`, `hybridWallClockSec(n, startupSec, iterSec)`.
- `qpuCost(provider, n, shots)`, `instanceCost(instance, wallClockSec)`, `jobTotalCost(...)`.
- `paramTimeNaive/paramTimeReused/paramSavedSec(n, compileSec, runSec)`.
- `wastedNoCheckpoint(failAt)`, `wastedWithCheckpoint(failAt, every)`.
`qmetrics` reuses `chemistry.ts`/`h2-data.ts` directly (no new math).

## Integration & blast radius
- `markdown-renderer.tsx`: 4 imports + 4 `pre()` branches (`qjob|qparam|qcheckpoint|qmetrics`) after the `qpes` branch.
- 4 routing tests.
- **Fix** `06-hybrid-jobs/GUIDE.md:15` prereq "Completed: 00 through 04" → "00 through 05".
- Manifest drift check (H1 unchanged → no-op). `CLAUDE.md` web test count synced.

## Preserved verbatim
7 notebooks (with accurate descriptions), `algorithms/` (3 scripts), `containers/`
(Dockerfile, build_and_push.sh, requirements), all references/videos/papers,
Learning Objectives, Prerequisites (renumbered), the existing `qscrub`.

## Testing
`hybrid.test.ts` (closed-form: standalone ≥ hybrid wall-clock when queueWait>0;
paramSaved = (N−1)·compile; wastedWithCheckpoint ≤ wastedNoCheckpoint; instanceCost
linear in hours; jobTotalCost = qpu + instance). 4 routing tests. Full `npm test`,
lint, build (11 pages), `pytest` unchanged.

## Out of scope
No live AWS; no changes to notebooks/algorithms/containers; this is the last module.
