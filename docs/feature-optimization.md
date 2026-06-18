# Feature Optimization

> This file tracks ways to REFINE features that already exist in this project.
> It is NOT a roadmap of new features to add — nothing here introduces new
> functionality. Every item makes an existing feature cleaner, faster, safer,
> more accessible, or otherwise better.
>
> Maintained by the `/optimize-features` command. Last full inventory: 2026-06-17

## Feature Inventory

### A. Portal shell & navigation

| # | Feature | What it does | Where it lives | Last reviewed |
|---|---------|--------------|----------------|---------------|
| 1 | Landing / section catalog | Home page listing the seven curriculum sections as cards with progress, ordering, and notebook counts derived from the content manifest | `web/src/app/page.tsx`, `web/src/components/section-card.tsx`, `web/src/lib/sections.ts` | 2026-06-17 |
| 2 | Lesson reader | Static-export page per section: renders GUIDE.md via react-markdown and routes ~30 fenced code blocks to interactive widgets at build time | `web/src/app/learn/[section]/page.tsx`, `web/src/components/markdown-renderer.tsx`, `web/src/lib/content.ts` | 2026-06-17 |
| 3 | In-lesson navigation | Sidebar, prev/next links, animated page transitions, and a table of contents kept in lockstep with rendered heading ids | `web/src/components/sidebar.tsx`, `prev-next.tsx`, `transition-link.tsx`, `table-of-contents.tsx`, `web/src/lib/extract-headings.ts` | 2026-06-17 |
| 4 | Dark / light theme | Theme toggle backed by next-themes, with compile-time tokens via Tailwind v4 `@theme inline` | `web/src/components/theme-toggle.tsx`, `web/src/app/globals.css`, `web/src/app/layout.tsx` | 2026-06-17 |
| 5 | Progress tracking | Per-section completion state in localStorage, surfaced as catalog progress and a nav badge, via SSR-safe `useSyncExternalStore` | `web/src/lib/progress-store.ts`, `web/src/hooks/use-progress.ts`, `web/src/components/section-progress.tsx` | 2026-06-17 |

### B. Interactive explorables (by curriculum domain)

| # | Feature | What it does | Where it lives | Last reviewed |
|---|---------|--------------|----------------|---------------|
| 6 | Foundations explorables | Bloch builder + 3D sphere, circuit lab (qsim DSL), wavefunction scrubber, shots sampler, correlation demo, scroll-driven Bloch (`qbloch/qsim/qscrub/qshots/qcorr/qscrolly`) | `web/src/components/quantum/{bloch-builder,bloch-sphere-3d,circuit-lab,wavefunction-scrubber,shots-sampler,correlation-demo,scrolly-section}*` | 2026-06-17 |
| 7 | Hardware explorables | Device table, qubit-topology explorer, noise visualizer, cost calculator (`qdevices/qtopo/qnoise/qcost`) | `web/src/components/quantum/{device-table,topology-explorer,noise-visualizer,cost-calculator}*` | 2026-06-17 |
| 8 | Algorithms explorables | Deutsch-Jozsa, Grover, QFT, QAOA visualizers (`qdj/qgrover/qft/qoptim`) | `web/src/components/quantum/{dj-demo,grover-visualizer,qft-visualizer,qaoa-explorer}*` + `{deutsch-jozsa,grover,qft,qaoa}.ts` | 2026-06-17 |
| 9 | Quantum ML explorables | VQC trainer, kernel explorer, barren-plateau explorer, data-encoding explorer (`qvqc/qkernel/qbarren/qencode`) | `web/src/components/quantum/{vqc-trainer,kernel-explorer,barren-explorer,encoding-explorer}*` | 2026-06-17 |
| 10 | Quantum chemistry explorables | VQE explorer, Jordan-Wigner explorer, Hamiltonian explorer, PES explorer (`qvqe/qjw/qham/qpes`) | `web/src/components/quantum/{vqe-explorer,jw-explorer,hamiltonian-explorer,pes-explorer}*` + `chemistry.ts` | 2026-06-17 |
| 11 | Hybrid-jobs explorables | Job explorer, parametric-compilation explorer, checkpoint explorer, metrics explorer (`qjob/qparam/qcheckpoint/qmetrics`) | `web/src/components/quantum/{job-explorer,param-compile-explorer,checkpoint-explorer,metrics-explorer}*` + `hybrid.ts` | 2026-06-17 |
| 12 | Shared widget engine | Reusable cores under the logic/view split: state-vector kernel, gate DSL parser, Dirac/Python readout, SSR-safe reduced-motion/WebGL detection | `web/src/components/quantum/{math,qsim-dsl,state-readout,use-display-caps}.ts` | 2026-06-17 |

### C. Learning systems

| # | Feature | What it does | Where it lives | Last reviewed |
|---|---------|--------------|----------------|---------------|
| 13 | In-browser runnable notebooks | "Run in browser" badge opens a JupyterLite lab running the curriculum notebooks under a qcsim wheel compiled into Pyodide | `web/jupyterlite-build/`, `web/src/components/notebook-link.tsx`, `scripts/validate_runnable.py` | 2026-06-17 |
| 14 | Inline runnable code editor | Monaco editor with a lazily-booted Pyodide+qcsim runtime running snippets in a serialized queue with per-run namespaces | `web/src/components/quantum/runnable-editor.tsx`, `code-editor.tsx`, `web/src/lib/{pyodide-run,pyodide-runtime}.ts` | 2026-06-17 |
| 15 | Code challenge auto-grader | Two-tier grader: TS state-vector comparison (up to global phase) for `qchallenge`, with a wired-but-unused Pyodide tier | `web/src/components/quantum/challenge.tsx`, `web/src/lib/{challenge-grade,challenge-schema,pyodide-grader}.ts` | 2026-06-17 |
| 16 | Spaced-repetition review | `qcard` recall cards graded with an SM-2/FSRS-style scheduler; `/review` dashboard surfaces due cards; nav badge shows the due count | `web/src/app/review/page.tsx`, `web/src/components/{review-dashboard,review-nav-badge}.tsx`, `quantum/review-card.tsx`, `web/src/lib/{review-schedule,review-store}.ts` | 2026-06-17 |
| 17 | Inline quizzes | `quiz` fenced blocks render interactive multiple-choice checks inside lessons | `web/src/components/quantum/quiz.tsx` | 2026-06-17 |
| 18 | Math & code rendering | Build-time KaTeX math (`remark-math`/`rehype-katex`) and syntax highlighting (`rehype-highlight`) with copy-to-clipboard | `web/src/components/{markdown-renderer,code-block,copy-button}.tsx` | 2026-06-17 |

### D. AI tutor

| # | Feature | What it does | Where it lives | Last reviewed |
|---|---------|--------------|----------------|---------------|
| 19 | "Ask the margin" tutor | Optional client-only streaming chat grounded in the current lesson, calling a Bedrock Function URL gated behind `NEXT_PUBLIC_TUTOR_URL` | `web/src/components/ask-tutor.tsx`, `web/src/lib/tutor.ts`, `lambda/tutor/{index.mjs,template.yaml}` | 2026-06-17 |
| 20 | Tutor corpus + grounding | Build-time corpus that strips each GUIDE.md into the grounding text the Lambda serves; prompt/grounding rules mirrored across three runtimes | `scripts/build_tutor_corpus.mjs`, `web/src/lib/tutor.ts`, `lambda/tutor/index.mjs` | 2026-06-17 |

### E. Python quantum library (`lib/`)

| # | Feature | What it does | Where it lives | Last reviewed |
|---|---------|--------------|----------------|---------------|
| 21 | Circuit primitives | Reusable teaching circuits (Bell, GHZ, QFT) on the Braket SDK | `lib/circuits/common.py` | 2026-06-17 |
| 22 | Chemistry toolkit | Molecular Hamiltonian construction + ansatz builders (OpenFermion), with an identity-energy honesty invariant | `lib/chemistry/{hamiltonians,ansatz}.py` | 2026-06-17 |
| 23 | QML toolkit | Feature maps (Möttönen amplitude encoding, IQP), VQC classifier (Braket + PennyLane), analytic-backprop training loop | `lib/ml/{feature_maps,classifiers,training}.py` | 2026-06-17 |
| 24 | Hardware abstraction | Device discovery and local/AWS circuit dispatch with S3 result routing | `lib/hardware/devices.py` | 2026-06-17 |
| 25 | Utilities | Result parsing, cost estimation, and plotting helpers | `lib/utils/{results,cost,visualization}.py` | 2026-06-17 |

### F. Browser simulator

| # | Feature | What it does | Where it lives | Last reviewed |
|---|---------|--------------|----------------|---------------|
| 26 | qcsim simulator | From-scratch NumPy state-vector simulator that re-implements the Braket API subset the notebooks use and self-aliases as `braket.*` in the browser | `qcsim/src/qcsim/{__init__,circuits,devices}.py` | 2026-06-17 |

### G. Curriculum content

| # | Feature | What it does | Where it lives | Last reviewed |
|---|---------|--------------|----------------|---------------|
| 27 | Notebook curriculum | Seven numbered sections, each a GUIDE.md plus notebooks (00/01 authored; 02-06 largely scaffolds) | `00-prereqs/` … `06-hybrid-jobs/` | 2026-06-17 |
| 28 | Hybrid-job scripts | Production-shaped Braket Hybrid Jobs entry points (QAOA max-cut, VQE chemistry, QML training) reusing `lib/` | `06-hybrid-jobs/algorithms/{qaoa_maxcut_job,vqe_chemistry_job,qml_training_job}.py` | 2026-06-17 |

### H. Build, infrastructure & ops

| # | Feature | What it does | Where it lives | Last reviewed |
|---|---------|--------------|----------------|---------------|
| 29 | Manifest drift gate + contract tests | Regenerates content/runnable manifests, AST-denylists browser-runnable notebooks, and executes them headlessly under qcsim; CI fails on drift | `scripts/validate_runnable.py`, `tests/test_notebook_contract.py`, `tests/test_qcsim_parity.py` | 2026-06-17 |
| 30 | CI pipeline | Three-job matrix (python tests+lint, web tests+lint, JupyterLite+export build-smoke) gating every PR and push to main | `.github/workflows/ci.yml` | 2026-06-17 |
| 31 | Amplify build & hosting | Static export + JupyterLite build pipeline and HTTP response config (cache headers) for the live site | `amplify.yml`, `customHttp.yml`, `web/jupyterlite-build/build.sh` | 2026-06-17 |
| 32 | Braket CloudFormation infra | Nested stacks: S3 results bucket, IAM role, AWS Budget alarms, optional SageMaker notebook, with deploy/teardown scripts | `infra/cloudformation/*.yaml`, `infra/scripts/*.sh` | 2026-06-17 |
| 33 | Cost reporting | `make cost` summarizes current-month Braket spend | `infra/scripts/cost-report.py`, `Makefile` | 2026-06-17 |

## Optimization Opportunities

> Impact-ranked, `file:line`-grounded refinements. Category A analyzed 2026-06-17
> (Feature 2 via verified multi-agent pass; Features 1/3/4/5 verified by direct
> source review after the agent pass hit transient API rate limits).
>
> STATUS: Category A (features 1-5) IMPLEMENTED 2026-06-17 — ESLint clean, 428 Jest
> tests passing, static-export build green, per-widget bundle split verified against
> build output, and live browser smoke test passed (list semantics, lazy widgets,
> theme toggle, mobile-drawer modal incl. inert + scroll lock + focus). The smoke
> test caught a real bug unit tests missed: the inline-code hue rule lost the cascade
> to @tailwindcss/typography's later layer — fixed by moving it to an UNLAYERED rule
> (globals.css bottom); inline code now tracks the section --hue live.

### 1. Landing / section catalog
- [x] **[Performance]** Summary build does a discarded notebooks `readdir` per section — `getContentSummary` calls full `getContent`, which also runs `listNotebooks` (readdir + per-file manifest lookup) that the teaser never uses. Impact: Low. Effort: Low. (`web/src/lib/content.ts:35-37,28`, `web/src/app/page.tsx:8-10`) — added 2026-06-17
- [x] **[Accessibility]** Whole-card link has a verbose run-on accessible name and the grid isn't a list — each card link reads "00 / N notebooks / title / summary / Explore section" as one name; the section grid uses `div` wrappers, not `ul`/`li`, so AT gives no item count. Impact: Medium. Effort: Low. (`web/src/components/section-card.tsx:19-59`, `web/src/app/page.tsx:55-71`) — added 2026-06-17
- [x] **[UX]** Blank teaser fallback — `summary={summaries[i] || ""}` renders an empty `line-clamp-3` paragraph when a GUIDE has no intro prose. Impact: Low. Effort: Low. (`web/src/app/page.tsx:66`, `web/src/lib/content.ts:56-73`) — added 2026-06-17

### 2. Lesson reader
- [x] **[Performance]** Every section page ships all ~32 widget bundles though each GUIDE uses only 4-9 — all widgets are statically imported and unconditionally referenced in one `makeComponents` closure, defeating tree-shaking. Fix needs a client boundary (markdown-renderer is a Server Component, so `next/dynamic ssr:false` can't go there directly). Impact: High. Effort: Medium. (`web/src/components/markdown-renderer.tsx:6-35,96-205`) — added 2026-06-17
- [x] **[Architecture & maintainability]** 30-branch copy-paste `if/else` fence dispatch should be a declarative registry — 28 near-identical arms repeat the same guard + `hastText(... as unknown as ...)` double-cast; adding a widget means editing two distant places. Impact: Medium. Effort: Medium. (`web/src/components/markdown-renderer.tsx:101-190`) — added 2026-06-17
- [x] **[Accessibility]** Horizontally-scrollable code fences are not keyboard-reachable (WCAG 2.1.1/1.4.10) — `<pre className="overflow-x-auto">` gets no `tabindex`/`role`/label, so keyboard users can't pan clipped lines. Impact: Medium. Effort: Low. (`web/src/components/code-block.tsx:56-62`, `web/src/components/markdown-renderer.tsx:200-204`) — added 2026-06-17
- [x] **[UI]** Inline-code chip hardcodes accent hue 192, breaking the per-section `--hue` cascade — every other lesson chrome keys off `var(--hue)` but inline `code` stays cyan on all 6 non-cyan sections. Impact: Medium. Effort: Low. (`web/src/app/globals.css:178-183` vs `148-170`, `web/src/app/learn/[section]/page.tsx:44-47`) — added 2026-06-17
- [x] **[UI]** Code-fence chrome (lang chip + wrap/copy) reveal-on-hover is unreachable on touch devices ≥640px — controls are gated on viewport width (`sm:`) + hover, so hoverless pointers wide enough to hit `sm:` never surface copy/wrap. Impact: Medium. Effort: Low. (`web/src/components/code-block.tsx:39,43,56-62`) — added 2026-06-17
- [x] **[Performance]** `buildLineSlugMap` re-scans the whole GUIDE a second time, redundant with the page's own `extractHeadings` — derive the line→slug map from the already-computed `Heading[]` and pass it as a prop. Build-time only. Impact: Low. Effort: Low. (`web/src/app/learn/[section]/page.tsx:38`, `web/src/components/markdown-renderer.tsx:212`, `web/src/lib/extract-headings.ts:71-73`) — added 2026-06-17

### 3. In-lesson navigation
- [x] **[Accessibility]** Mobile drawer is `aria-modal` but does not trap focus, inert the background, or lock body scroll — focus moves in and Escape closes (good), but Tab can leave the "modal" into the page behind the overlay, and `aria-modal=true` misreports the background as inert. Impact: Medium. Effort: Medium. (`web/src/components/sidebar.tsx:82-90,109-126`) — added 2026-06-17

### 4. Dark / light theme
- [x] **[Accessibility]** Theme toggle never announces state and keys off `theme` not `resolvedTheme` — `aria-label` is a static "Toggle theme" (icon is `aria-hidden`), and with `enableSystem` set a `"system"` value would mismatch the shown icon and first-click target. Derive icon + dynamic label ("Switch to light/dark theme") from `resolvedTheme`. Impact: Medium. Effort: Low. (`web/src/components/theme-toggle.tsx:9,16,18-28`, `web/src/app/layout.tsx:28`) — added 2026-06-17

### 5. Progress tracking
- [x] **[Performance]** Unscoped cross-tab `storage` listener recomputes on every unrelated localStorage write — `subscribe` passes the callback straight to `addEventListener("storage", ...)`, so theme/review/pyodide-cache writes in another tab all re-run `completedCount`/`isSectionComplete`. Filter on `e.key` (`null` or starts with `qc:`). Impact: Low. Effort: Low. (`web/src/lib/progress-store.ts:53-61`) — added 2026-06-17

> Category B note: the adversarial-verification stage was throttled by a sustained
> server-side rate limit. The 82 reviewer findings were recovered from the run
> transcripts; the **CORRECTNESS** items below were re-verified by reading the cited
> code directly (marked ✓verified), the rest are reviewer-surfaced with file:line
> evidence (marked ~reviewer) pending a clean verification pass.

### 6. Foundations explorables
- [x] **[Correctness]** ✓verified — **BlochDial silently drops the Y axis**: it computes `{x,y,z}` but plots only `px=c+r·x, py=c−r·z`, so `|i⟩`/`|−i⟩` collapse to the origin (look maximally-mixed) on the no-WebGL / reduced-motion fallback. Encode `y` (equatorial projection or tip marker). Impact: High. Effort: Medium. (`web/src/components/quantum/bloch-dial.tsx:9,13-14,23`) — added 2026-06-17
- [ ] **[Performance]** ~reviewer — **3D Bloch sphere runs a 60fps frameloop forever** (default `frameloop="always"`) even after the lerp settles and nobody is interacting. Switch to `frameloop="demand"` + `invalidate()` while moving. Impact: High. Effort: Medium. (`web/src/components/quantum/bloch-sphere-3d.tsx:49-58,148`) — added 2026-06-17
- [ ] **[UX]** ~reviewer — **3D Bloch `dynamic()` has no `loading` fallback** → blank gap + 132→180px layout shift on first paint. Reserve a fixed-size box / loading placeholder. Impact: High. Effort: Medium. (`bloch-builder-widget.tsx:12`, `wavefunction-scrubber.tsx:21`, `scrolly-section.tsx:29`) — added 2026-06-17
- [x] **[Accessibility]** DONE — **Slider-driven P(0)/P(1) + Dirac results now announced to screen readers** via the cross-cutting live-region sweep. Impact: High. Effort: Low. (`bloch-builder-widget.tsx:55-79`, `circuit-lab.tsx:67-90`, `wavefunction-scrubber.tsx:124-148`) — added 2026-06-17
- [ ] **[Consistency & reuse]** ~reviewer — Gate-chip label markup and the Dirac+dual-copy readout block are triplicated across circuit-lab/correlation-demo/wavefunction-scrubber; the probability-bar row is repeated across the circuit family. Extract shared components. Impact: Medium. Effort: Medium. (`circuit-lab.tsx`, `correlation-demo.tsx`, `wavefunction-scrubber.tsx`) — added 2026-06-17
- [ ] **[Performance]** ~reviewer — `useWebGL` allocates a throwaway canvas + GL context every render (it's the `useSyncExternalStore` getSnapshot). Memoize detection at module scope. Impact: Low. Effort: Low. (`use-display-caps.ts:20-36`) — added 2026-06-17
- [ ] **[Consistency & reuse]** ~reviewer — Two Born-rule samplers (`shots.ts sampleCounts` vs `correlation.ts sampleOutcome`) for one basis-state draw. Consolidate. Impact: Low. Effort: Low. (`shots.ts:5-20`, `correlation.ts:25-31`) — added 2026-06-17

### 7. Hardware explorables
- [x] **[Correctness]** ✓verified — **Noise widget mislabels a classical distribution overlap as "fidelity"**: `fidelityDist` is `(Σ√(pᵢqᵢ))²` over diagonal populations only, so a pure-dephasing channel reports 100% "fidelity" while true state fidelity drops. Rename to "classical fidelity / agreement" or compute true `F(ρ,σ)` from the `rho` already built. Impact: High. Effort: Low. (`web/src/components/quantum/noise.ts:121-128`, `noise-visualizer.tsx:78-95`) — added 2026-06-17
- [x] **[Accessibility]** DONE — **Interactive readouts (SWAP count, fidelity %, total cost) now announced** via the cross-cutting live-region sweep. Impact: High. Effort: Low. (`topology-explorer.tsx:333-341`, `noise-visualizer.tsx:94-96`, `cost-calculator.tsx:176-178`) — added 2026-06-17
- [ ] **[Correctness]** ~reviewer — Topology explorer claims "depth +N" for N routing SWAPs, understating true added depth (each SWAP = 3 CNOTs and they may not parallelize). Impact: Medium. Effort: Low. (`topology-explorer.tsx`, `topology.ts`) — added 2026-06-17
- [ ] **[Consistency & reuse]** ~reviewer — Device cost strings duplicate and drift from `cost.ts` (the declared single source of truth); `noise.ts` re-derives gate dispatch already in `math.ts applyOp`. Impact: Medium. Effort: Medium. (`device-table.tsx`/`devices.ts` vs `cost.ts`; `noise.ts`) — added 2026-06-17
- [ ] **[Performance]** ~reviewer — Noise slider re-runs the full density-matrix Kraus simulation synchronously on every drag tick (no debounce/async). Impact: Medium. Effort: Low. (`noise-visualizer.tsx:173`, `noise.ts`) — added 2026-06-17
- [ ] **[Accessibility]** ~reviewer — Device-table sort buttons have no visible focus indicator and expose no action affordance to AT (Unicode arrow glyphs only). Impact: Medium. Effort: Low. (`device-table.tsx`) — added 2026-06-17

### 8. Algorithms explorables
- [x] **[Correctness]** ✓verified — **QFT visualizer asserts a false "spikes every N/r" claim for periods that don't divide N**: `spacing=N/value` is accepted without a divisibility check, so period 3 / N 8 prints "spikes every N/r = 2.6666666666666665" and `idx % spacing` (fractional) highlights only bin 0. Reject non-dividing periods or gate the note/highlight on integer `spacing` and format it. Impact: High. Effort: Low. (`web/src/components/quantum/qft-visualizer.tsx:64-66,150-156`, `qft.ts:29-37`) — added 2026-06-17
- [ ] **[Accessibility]** ~reviewer — Deutsch-Jozsa probability bars animate width with no `prefers-reduced-motion` guard. Impact: Medium. Effort: Low. (`dj-demo.tsx`) — added 2026-06-17
- [ ] **[UI]** ~reviewer — DJ bars never reach 100% (fixed-gap track layout); ErrorCard + parse discriminator and the label|bar|percent row are duplicated/divergent across all four algorithm widgets. Impact: Medium. Effort: Medium. (`dj-demo.tsx`, `grover-visualizer.tsx`, `qft-visualizer.tsx`, `qaoa-explorer.tsx`) — added 2026-06-17
- [ ] **[Performance]** ~reviewer — QAOA recomputes graph-only maxCut and simulates the full state vector twice per gamma/beta slider tick. Memoize the graph-invariant parts. Impact: Medium. Effort: Low. (`qaoa-explorer.tsx`, `qaoa.ts`) — added 2026-06-17
- [ ] Note: core math of `qft.ts` / `deutsch-jozsa.ts` / `qaoa.ts` verified correct inline; the known QAOA bar bit-reversal (from /eval) remains the catalogued label defect.

### 9. Quantum ML explorables
- [x] **[Correctness]** ✓verified — **Encoding explorer shows physically wrong Bloch dials for the IQP feature map**: only `amplitude` is special-cased, so `iqp` reuses product-state `singleQubitRy(x0)/(x1)` dials — but `iqpState` is *entangled*, so the true single-qubit reduced states are mixed (shorter vectors), not those pure RY qubits. Render reduced states via partial trace (or drop the dials for IQP). Impact: High. Effort: Medium. (`web/src/components/quantum/encoding-explorer.tsx:76-81,127-143`, `encoding.ts:26-38`) — added 2026-06-17
- [ ] **[Performance]** ✓verified — Kernel decision boundary rebuilds all 60 training feature states inside each of 1296 grid cells (~81k redundant constructions/recompute). Precompute `trainStates` once + a `kernelScoreS` variant. Impact: Medium. Effort: Low. (`kernel.ts:29-34`, `kernel-explorer.tsx:135-146`) — added 2026-06-17
- [ ] **[Accessibility]** ~reviewer — `VqcTrainer` training result (step/loss/accuracy) is silent to AT; kernel/barren don't announce recomputed accuracy/variance. Cross-cutting (below). Impact: High. Effort: Low. (`vqc-trainer.tsx:287-292`) — added 2026-06-17
- [ ] **[Consistency & reuse]** ~reviewer — `mulberry32` RNG + `gauss` helper copy-pasted across `barren.ts`/`kernel.ts`/`vqc.ts` (also noted in /eval); accuracy fn duplicated across .ts/.tsx; `Pt` vs `Point` defined twice. Extract a shared `rng.ts`. Impact: Medium. Effort: Low. (`barren.ts`, `kernel.ts`, `vqc.ts`) — added 2026-06-17
- [ ] **[UX]** ~reviewer — Train/kernel recompute (40-step burst / 1296-cell grid) gives no busy/pressed feedback or debounce. Impact: Medium. Effort: Medium. (`vqc-trainer.tsx`, `kernel-explorer.tsx`) — added 2026-06-17
- [ ] **[Performance]** ~reviewer — `VqcTrainer` recomputes full-dataset loss+accuracy un-memoized each render. Impact: Low. Effort: Low. (`vqc-trainer.tsx:224-225`) — added 2026-06-17

### 10. Quantum chemistry explorables
- [ ] **[Accessibility]** ~reviewer — **PES scrubber announces only bond length** (`aria-valuetext`), hiding the FCI/HF/correlation-gap readout — the lesson's whole payload — from screen readers. Extend `aria-valuetext` to embed the energies (the VQE slider already does this). Impact: High. Effort: Low. (`pes-explorer.tsx:371,379-394`) — added 2026-06-17
- [ ] **[UI]** ~reviewer — VQE plot has no axis labels or tick scale (energy/theta unanchored); Optimize 32ms ticks collide with the 150ms CSS marker transition (rubber-banding); left column doesn't collapse on narrow viewports. Impact: Medium. Effort: Medium. (`vqe-explorer.tsx`) — added 2026-06-17
- [ ] **[Consistency & reuse]** ~reviewer — PES reimplements interpolation + analytic ground-energy already in `chemistry.ts`; bond-length lerp triplicated; ErrorCard + parse preamble copy-pasted across all four chemistry widgets; VQE hand-rolls an X-Z Bloch indicator instead of reusing BlochDial. Impact: Medium. Effort: Medium. (`pes-explorer.tsx`, `vqe-explorer.tsx`, `chemistry.ts`) — added 2026-06-17
- [ ] **[Accessibility]** ~reviewer — Low-contrast qubit/identity labels in JW and Hamiltonian cells fall below WCAG AA; JW Pauli `X/Y` glyph overflows its fixed mono cell. Impact: Medium. Effort: Low. (`jw-explorer.tsx`, `hamiltonian-explorer.tsx`) — added 2026-06-17

### 11. Hybrid-jobs explorables (gap-fill re-run 2026-06-17 — 12 verified)
- [ ] **[Correctness]** ✓verified — Metrics-explorer y-axis is seeded from the user `threshold` (not the data), so an out-of-band threshold flattens/squeezes the genuine VQE convergence curve. Seed the y-range from the energy history; clamp the threshold line. Impact: Medium. Effort: Low. (`metrics-explorer.tsx:121-126,186-192`) — added 2026-06-17
- [ ] **[Correctness]** ✓verified — Checkpoint explorer counts the failed in-flight iteration as free; "fail at N" under-counts redone work by one (count/shading/prose disagree). Pick one convention. Impact: Low. Effort: Low. (`hybrid.ts:103-115`, `checkpoint-explorer.tsx:157-171,285`) — added 2026-06-17
- [ ] **[Accessibility]** ✓verified — Recomputed readouts (job-explorer delta line, metrics streaming plot) have no `aria-live`; Stream/Reset expose no running state. Impact: Medium. Effort: Low. (`job-explorer.tsx:484-493`, `metrics-explorer.tsx:204-210`) — added 2026-06-17
- [ ] **[Performance]** ✓verified — Metrics stream loop re-renders the whole widget per tick, recomputing all plot geometry. Impact: Low. Effort: Low. (`metrics-explorer.tsx:194-197`) — added 2026-06-17
- [ ] **[Cleaner code]** ✓verified — Four near-identical parse/clamp/ErrorCard scaffolds duplicated across qjob/qparam/qcheckpoint/qmetrics; checkpoint clamps twice and re-derives `lastCheckpoint` already in `hybrid.ts`. Impact: Low. Effort: Medium. (`job-explorer.tsx:69`, `param-compile-explorer.tsx:40`, `checkpoint-explorer.tsx:81-85`) — added 2026-06-17
- [ ] **[UI]** ✓verified — Checkpoint timeline FAILURE/final-tick markers clip to half-width at the right edge; Stream button silently restarts on re-click. Impact: Low. Effort: Low. (`checkpoint-explorer.tsx:127`, `metrics-explorer.tsx:364-370`) — added 2026-06-17

### 12. Shared widget engine (gap-fill re-run 2026-06-17 — 8 verified)
- [ ] **[Correctness]** ✓verified — Dirac readout shows phantom `0.00|…⟩` terms and silently drops small imaginary parts (filter/format threshold mismatch). Impact: Medium. Effort: Low. (`state-readout.ts:20`) — added 2026-06-17
- [ ] **[Correctness]** ✓verified — RX/RY/RZ rotation matrices are not pinned to the qcsim fixtures (only the static gates are), despite the kernel's documented 1e-10 agreement. Add fixture coverage. Impact: Low. Effort: Low. (`math.ts:1-10,42-56`) — added 2026-06-17
- [ ] **[Performance]** ✓verified — `useWebGL` allocates a throwaway canvas + GL context on every render (uncached getSnapshot). Memoize detection at module scope. Impact: Medium. Effort: Low. (`use-display-caps.ts:20-36`) — added 2026-06-17
- [ ] **[Consistency & reuse]** ✓verified — qsim gate set duplicated/driftable between `math.ts` (NAMED_GATES) and `qsim-dsl.ts`; `ParsedGate` vs `Op` shapes diverge (angle vs theta); BlochBuilder hand-rolls state/probabilities instead of the math.ts kernel; DJ/QAOA inline `state.map(cAbs2)` instead of `probabilities()`. Impact: Medium. Effort: Low-Medium. (`math.ts:60`, `qsim-dsl.ts:19-25`, `bloch-builder.ts:4-17`) — added 2026-06-17

### Cross-cutting (Category B): missing live regions
- [x] **[Accessibility]** DONE 2026-06-17 — **Interactive explorable readouts now announce via live regions.** Added `role="status" aria-live="polite"` to the result block of bloch-builder, circuit-lab, wavefunction-scrubber, noise (fidelity), vqc-trainer (step/loss/acc), cost-calculator (total), and topology (SWAP count); PES extends the slider `aria-valuetext` to read FCI/HF/gap. 8 widgets, 2 regression tests. Impact: High. Effort: Medium.

## Category C — features 13-33 (analyzed 2026-06-17, big multi-agent run)

> 85 reviewer findings recovered from a rate-limited run (verify stage throttled).
> Items below are tagged ✓verified (re-read in code: 4 inline + `estimate_cost` by
> the workflow) or ~reviewer (file:line evidence, pending a clean verification pass).
> Long tail of Medium/Low items lives in the run transcripts.

### 13-14. In-browser execution runtime
- [ ] **[Resilience]** ✓verified — **No execution timeout**: `runSerialized` awaits `runPythonAsync` with no timeout/abort on a shared module-global queue, so a learner's `while True: pass` hangs the tab AND wedges every subsequent run/grade (the reject-guard only handles errors, not hangs). **DEFERRED**: a JS `Promise.race` cannot interrupt a CPU-bound `while True` (Pyodide blocks the main thread, so `setTimeout` never fires) — the real fix is moving the runtime to a Web Worker (its own PR). Impact: High. Effort: High. (`web/src/lib/pyodide-runtime.ts:70,84-95`) — added 2026-06-17
- [x] **[Resilience]** ✓verified — DONE (PR pending) — **A failed Pyodide boot is cached forever**: `getPyodide` assigns `pyodidePromise` before the async boot and returns it unconditionally, so one CDN/wheel failure bricks every runnable cell with no retry. Null the cache on rejection. Impact: High. Effort: Low. (`web/src/lib/pyodide-runtime.ts:46-64`) — added 2026-06-17
- [ ] **[Correctness]** ~reviewer — stderr is mislabeled as successful stdout in the runnable editor; the stdout/stderr sink is never detached after a run, leaking async output into the next run. Impact: Medium. Effort: Medium. (`runnable-editor.tsx`, `pyodide-runtime.ts:84-95`) — added 2026-06-17
- [ ] **[Performance/Consistency]** ~reviewer — every runnable fence eagerly mounts its own Monaco editor on hydration (no viewport gating); qcsim bootstrap is triplicated across 3 authored copies; Pyodide version pinned independently in TS runtime + JupyterLite kernel (driftable). Impact: Medium. Effort: Medium. (`runnable-editor.tsx`, `pyodide-runtime.ts:12`, `jupyterlite-build/`) — added 2026-06-17
- [ ] **[Accessibility]** ~reviewer — run success/error conveyed only by an aria-hidden color dot; disabled "Run in browser" button unreachable by keyboard/SR. Impact: Medium. Effort: Low. (`runnable-editor.tsx`, `notebook-link.tsx`) — added 2026-06-17

### 15. Code challenge auto-grader
- [x] **[Correctness]** ✓verified — DONE (PR pending) — **Slider-bound `theta` in a target program grades against the wrong state**: both graders build the reference via `opsFor(target, 0)`, so a `theta` rotation in the author's `target.program` collapses to RY(0)=identity. Reject reference programs with `hasTheta === true`. Impact: High. Effort: Low. (`challenge-grade.ts:38`, `pyodide-grader.ts:53`, `qsim-dsl.ts:71-73,102`) — added 2026-06-17
- [x] **[Security/Resilience]** DONE (PR pending) — author-supplied `spec.qubits` unclamped into `1<<n` allocation; parse errors swallowed. FIXED: `MAX_QUBITS` clamp at both grader entries (`challenge-grade.ts`, `pyodide-grader.ts`); parse-error guard added in #21. RECLASSIFIED by the security audit to **author-only / Low** — the learner path is already hard-clamped at `MAX_QUBITS=4` (`qsim-dsl.ts:91`), so this is defense-in-depth against an author typo, not a learner-triggerable DoS. Impact: High→Low. Effort: Low. — added 2026-06-17
- [ ] **[Accessibility]** ~reviewer — the verdict `role="status"` region is conditionally mounted, so SR misses the announcement; add `aria-live` always-present. Impact: High. Effort: Low. (`challenge.tsx:168-175`) — added 2026-06-17
- [ ] **[Security/Tests]** ~reviewer (RECLASSIFIED + DEFERRED) — Tier-B `gradePy` raw-Python concat. Security audit verdict: **not a security vuln** — Pyodide is the learner's own same-user WASM sandbox, so "injection" self-harms only. Residual is grading-INTEGRITY (a learner can false-pass by stubbing `circuit`) — Low, and only matters once `tier:"py"` content ships (none today; cross-run leakage already prevented by the fresh per-run namespace). DEFERRED: namespace the grading epilogue away from learner symbols. The "no SRI on the Pyodide/Monaco CDN" half is promoted to its own audit finding below. Impact: Low. Effort: Medium. (`pyodide-grader.ts`) — added 2026-06-17
- [ ] **[Security]** ✓verified (audit 2026-06-18) — DEFERRED to its own PR — Pyodide + Monaco load from the jsdelivr CDN with **no Subresource Integrity, no `crossorigin`, and no site-wide CSP** (`pyodide-runtime.ts:35-44`, `code-editor.tsx`); a tampered CDN script would execute with full page privileges. Version-pinned (not auto-upgrade) + low likelihood, but trivial to mitigate. Deferred because a CSP needs a staged report-only rollout + live-lab testing (Monaco / Pyodide / JupyterLite iframe) to avoid breaking the live site, and SRI on the entry script is only partial (Pyodide fetches further assets itself). Impact: Medium. Effort: Medium. (`web/src/lib/pyodide-runtime.ts:35-44`, `web/src/components/code-editor.tsx`, `customHttp.yml`) — added 2026-06-18

### 16. Spaced-repetition review
- [ ] **[Resilience]** ~reviewer — **Corrupt-but-valid-JSON card state poisons the schedule with NaN** / silently vanishes: guards only catch `JSON.parse` throwing, not a semantically-broken record (`{}`, truncated, old schema). Add a structural validator (all numeric fields `Number.isFinite`). Impact: High. Effort: Low. (`review-store.ts:57-64,86`) — added 2026-06-17
- [ ] **[Correctness]** ~reviewer — graduating step shrinks the interval on a successful "Hard" review (after "Easy"), contradicting SM-2 monotonicity. Impact: Medium. Effort: Low. (`review-schedule.ts`) — added 2026-06-17
- [ ] **[Accessibility]** ~reviewer — "Show answer" disclosure has no `aria-expanded`/`aria-controls` and never moves focus to the revealed answer; nav-badge due-count + dashboard "N due" recompute silently (no aria-live); grade buttons are an unlabeled group and grading throws focus away. Impact: High. Effort: Low. (`review-card.tsx:149-170`, `review-nav-badge.tsx`, `review-dashboard.tsx`) — added 2026-06-17
- [ ] **[Performance]** ~reviewer — nav badge runs a full localStorage scan + JSON.parse of every card on every root render; `review-card.tsx` hand-rolls its own store subscription (bypassing shared `subscribe()`). Impact: Medium. Effort: Medium. (`review-nav-badge.tsx`, `review-card.tsx`) — added 2026-06-17

### 17-18. Quizzes & content rendering
- [ ] **[Correctness]** ~reviewer — quiz text renders LaTeX/Dirac notation as literal characters (math silently broken inside quiz prompts/options); the optional `hint` field bypasses type validation and can crash render. Impact: Medium. Effort: Medium. (`quiz.tsx`) — added 2026-06-17
- [ ] **[Resilience]** ~reviewer — CopyButton reports "Copied" even when both clipboard paths silently fail. Impact: Medium. Effort: Low. (`copy-button.tsx`) — added 2026-06-17
- [ ] **[Accessibility]** ~reviewer — revealed quiz answer/hint never announced; disclosure buttons expose `aria-controls` only while open; code-block controls overlap the first code line on touch. Impact: Medium. Effort: Low. (`quiz.tsx`, `code-block.tsx`) — added 2026-06-17
- [ ] **[Consistency]** ~reviewer — `renderInline` inline-markdown formatter byte-duplicated between `quiz.tsx` and `review-card.tsx`. Impact: Low. Effort: Low. — added 2026-06-17

### 19-20. AI tutor (Ask the margin) + corpus
- [x] **[Ops]** DONE (PR pending) — **Handler returns HTTP 200 on every Bedrock failure**, so the Lambda Errors metric never fires and no alarm can be built on it; mid-stream failures render as the answer (client never enters its error state). Emit a structured error sentinel + log a metric. Impact: High. Effort: Medium. (`lambda/tutor/index.mjs:53-88`) — added 2026-06-17
- [x] **[Resilience]** DONE (PR pending) — no client timeout/abort: a stalled stream hangs the UI forever and Close cannot cancel it (no AbortController). Impact: High. Effort: Medium. (`ask-tutor.tsx:70-82,121`) — added 2026-06-17
- [x] **[Correctness]** DONE (PR pending) — **corpus build silently truncates 3 of 7 lessons mid-document** at `SECTION_CHAR_CAP=12000` while still advertising all their headings (corpus.json shows 01-foundations/05/06 at exactly 12000 chars). Warn/fail + truncate on a section boundary. Impact: Medium. Effort: Low. (`build_tutor_corpus.mjs:31`, `tutor.ts:40`) — added 2026-06-17
- [x] **[Accessibility]** DONE (PR pending) — streamed answer renders in a plain `<p>` with no aria-live; the modal slide-over has no focus trap and never restores focus to the trigger on close. Impact: High. Effort: Medium. (`ask-tutor.tsx:105-110,131-134`) — added 2026-06-17
- [ ] **[Tests/Ops]** ~reviewer (PARTIAL) — Lambda handler/parseBody/corpus builder tests + log-retention + deploy gate. DONE: structured error log + corpus truncation warn (#22); body-size + slug caps + prototype-pollution guard on the `CORPUS[slug]` lookup, reserved-concurrency cap, scoped Bedrock IAM, runtime bumped to `nodejs22.x` (nodejs20.x was EOL), log-retention documented (CLI `put-retention-policy`). (The hourly-invocations CloudWatch alarm → `quantum-tutor-alerts` SNS topic already existed outside the stack — discovered during deploy — so the template doesn't re-declare it.) STILL OPEN: Lambda handler unit tests; declaring the LogGroup in IaC (conflicts with the auto-created group — needs CFN import or the one-off CLI); corpus-freshness/model-id deploy gate. Impact: Medium. Effort: Medium. (`lambda/tutor/`, `scripts/build_tutor_corpus.mjs`) — added 2026-06-17
- [x] DONE (PR pending) — the eval-catalogued **tutor faucet**: `ReservedConcurrentExecutions` cap (`MaxConcurrency=5`, the load-bearing control) + Bedrock IAM scoped to the inference-profile + foundation-model ARNs (was `Resource:"*"`). An hourly-invocations CloudWatch alarm → `quantum-tutor-alerts` SNS topic (email-subscribed) already existed outside the stack. `AuthType: NONE` retained (static-site UX) but now bounded by the concurrency cap; CORS recalibrated in the README as a browser-only UX allowlist, **not** an access control. The "answer only from lesson" prompt is UX, not a security boundary.

### 21, 24, 25. Python library: circuits + hardware + utils
- [x] **[Security/Correctness]** ✓verified — DONE (PR pending) — **`run_circuit` dispatches to real QPUs with no shots cap or cost guard**, violating CLAUDE.md's cost-awareness rule; validate `shots` and surface `estimate_cost` before `device.run`. Impact: High. Effort: Low. (`lib/hardware/devices.py:37-54`) — added 2026-06-17
- [x] **[Correctness]** ✓verified — DONE (PR pending) — `estimate_cost` returns negative costs for negative shots/minutes (no input validation), feeding bad numbers into the cost-warning string. Raise on negative inputs. Impact: Low. Effort: Low. (`lib/utils/cost.py:15-24`) — added 2026-06-17
- [ ] **[Architecture]** ~reviewer — device identity keyed two incompatible ways: `hardware` uses short names (`ionq_aria`), `cost` uses provider names (`IonQ`) — the two halves a learner chains don't compose. Unify to one registry. Impact: High. Effort: Medium. (`lib/hardware/devices.py:8-16`, `lib/utils/cost.py:3-12`) — added 2026-06-17
- [x] **[Correctness/Tests]** DONE (PR pending) — `parse_counts` assumed bitstring column position == qubit index. FIXED: documents the contract and raises if `result.measured_qubits` is exposed and isn't `0..n-1` in order (rather than silently mislabeling); + a column-order pin test and a non-contiguous-rejection test. (The audit cleared the *web* qjw visualizer — its column==qubit is a correct big-endian convention, not a bug.) Remaining sub-items (mock-dtype divergence, GHZ-coverage, half-typed API) are separate, still open. Impact: Medium. Effort: Medium. (`lib/utils/results.py`) — added 2026-06-17

### 22-23. Python library: chemistry + QML
- [ ] **[Performance]** ~reviewer — `quantum_kernel` constructs a fresh `LocalSimulator` on every call across an O(N²) Gram matrix; `train_vqc` evaluates every training circuit twice per epoch (loss + accuracy). Reuse one device; fold the passes. Impact: Medium. Effort: Low. (`lib/ml/classifiers.py`, `lib/ml/training.py`) — added 2026-06-17
- [ ] **[Correctness/API]** ~reviewer (PARTIAL) — `uccsd_singles_circuit` silently truncated excitations when `params` was too short. DONE: it now validates `len(params) == n_electrons*(n_qubits-n_electrons)` and raises (+ test). STILL OPEN: the three incompatible `params` conventions across builders, the linear-vs-circular entangling-topology disagreement, and the other silent-degrade builders. Impact: Medium. Effort: Medium. (`lib/chemistry/ansatz.py`, `lib/ml/feature_maps.py`, `lib/ml/classifiers.py`) — added 2026-06-17

### 26. qcsim browser simulator
- [ ] Reviewers were rate-limited out for this cluster; the eval-catalogued parity-coverage gap (rx/rz/y/z/s/t/swap/cphaseshift/ccnot not numerically compared vs real Braket) remains the known item. Clean re-run pending.

### 27-28, 29-33. Curriculum + Build/infra/ops
- [ ] Reviewers were rate-limited out for these clusters. The eval-catalogued items stand: 34/45 stub notebooks + 3 stubs shipping a green Run badge (29); zero Amplify security headers (31); undeployable nested CFN — no `package` step (32); `qaoa_maxcut_job.py` broad-except→LocalSimulator + finalizes on a different device (28). Clean re-run pending.
