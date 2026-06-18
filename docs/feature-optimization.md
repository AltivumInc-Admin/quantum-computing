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
