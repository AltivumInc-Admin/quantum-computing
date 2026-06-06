# Intro Modules Overhaul — Design Spec

## Overview

Transform the two introductory learning modules of the Quantum Computing Workspace web
portal from dry, glossary-style reference pages into a captivating, narrative-driven,
interactive learning experience. The work has two phases:

- **Phase 0 — Renumber the curriculum `00`→`06`.** The repo currently has two `00`
  directories (`00-prereqs` and `00-foundations`), so directory prefixes no longer match
  module position. Renumber the whole sequence so each prefix equals its catalog index and
  there is a single `00`.
- **Phase 1 — Rewrite and enrich the two intro modules.** Full narrative rewrite of
  `00-prereqs/GUIDE.md` and `01-foundations/GUIDE.md` (the post-rename name of today's
  `00-foundations`) as a single connected arc, with a pedagogical reorder of foundations
  and three new interactive widgets.

The two phases ship as separate PRs. Phase 0 is mechanical plumbing with no prose changes;
Phase 1 is the creative core and is done first among the per-module content passes the user
plans to make across the curriculum.

## Goals

- Replace the reference-manual tone of `01-foundations` with a motivated, momentum-carrying
  narrative that introduces each concept as a consequence of the one before it.
- Carry the `00-prereqs` "spun coin" metaphor forward into foundations so the two modules
  read as one continuous story.
- Resequence `01-foundations` so measurement is understood before entanglement, the circuit
  model is introduced before the reader has already been running circuits, and the Bell pair
  lands as a climax.
- Put an interactive payoff at every conceptual beat, using the existing widget palette more
  fully and adding three new widgets that demonstrate concepts currently only described in
  prose.
- Establish a single, consistent numbering convention for the curriculum.

## Non-Goals (Out of Scope)

- Jupyter notebook (`.ipynb`) content — the hands-on exercises are not rewritten here.
- Prose for modules `02`–`06` — they are only *renamed* in Phase 0, never rewritten.
- The JupyterLite lab application itself beyond path/regeneration fixes.
- Any backend, authentication, or persistence beyond the existing localStorage progress.
- Emoji or decorative ornamentation in any user-facing copy (per project UI rules: clean,
  professional register; "captivating" comes from vivid prose and analogy, not decoration).

## Constraints

- Static export only (`output: "export"`). Every widget is a client component with no SSR
  and no server runtime; heavy deps (three.js, Pyodide) stay lazily loaded as today.
- Content is authored as Markdown `GUIDE.md`; interactive widgets are custom fenced code
  blocks routed by `web/src/components/markdown-renderer.tsx`.
- The curriculum catalog is generated — `scripts/validate_runnable.py` `SECTION_DIRS` is the
  single ordering source; `web/src/lib/sections.ts`, the section hues, and the "Run in
  browser" gate all derive from the generated manifest. Never hand-edit the manifest.
- All animations respect `prefers-reduced-motion`; all controls are keyboard-accessible with
  ARIA labels, matching the existing widgets.

---

## Phase 0 — Renumber `00`→`06`

### Target mapping

| Current dir | New dir | Catalog index | Title (unchanged) |
|---|---|---|---|
| `00-prereqs` | `00-prereqs` | 0 | Prerequisites: From Zero to Ready-for-Quantum |
| `00-foundations` | `01-foundations` | 1 | Quantum Computing Foundations |
| `01-hardware` | `02-hardware` | 2 | Quantum Hardware on Amazon Braket |
| `02-algorithms` | `03-algorithms` | 3 | Quantum Algorithms |
| `03-quantum-ml` | `04-quantum-ml` | 4 | Quantum Machine Learning |
| `04-quantum-chemistry` | `05-quantum-chemistry` | 5 | Quantum Chemistry & Biochemistry |
| `05-hybrid-jobs` | `06-hybrid-jobs` | 6 | Production Hybrid Quantum-Classical Jobs |

Six directories are renamed (`00-prereqs` keeps its name). The slug equals the directory
name equals the `/learn/<slug>` URL, so six URLs change.

### Blast radius (source of truth, not artifacts)

Edit / rename:
1. `scripts/validate_runnable.py` — update the `SECTION_DIRS` list (the catalog order).
2. `git mv` the six module directories (preserves history).
3. `scripts/generate_notebooks.py` — hardcoded module paths (e.g. `00-foundations/notebooks/...`).
4. `web/jupyterlite-build/prepare_notebooks.py` and the staged mirror under
   `web/jupyterlite-build/files/` — the lab staging source.
5. Cross-links inside GUIDEs: `00-prereqs/GUIDE.md` (links to `../00-foundations/GUIDE.md`),
   and the `01`–`04` GUIDEs that reference sibling module dirs.
6. `README.md` and `CLAUDE.md` — any module-path references.
7. Web tests that hardcode slugs/dir names: `web/__tests__/lib/{content,manifest,sections}.test.ts`,
   `web/__tests__/components/{notebook-link,prev-next,section-card,section-progress,sidebar}.test.tsx`.
8. `tests/test_prereqs.py` and any Python tests referencing module paths.

Regenerate (do not hand-edit):
- `web/src/lib/content-manifest.json` and `web/src/lib/runnable-manifest.json` via
  `python scripts/validate_runnable.py --write-manifest`.
- `web/public/lab/**` via `bash web/jupyterlite-build/build.sh` (Amplify also does this at
  deploy; confirm whether `web/public/lab` is committed or gitignored and act accordingly).

### Redirects

Add 301 redirects in the **Amplify Console → Hosting → Rewrites and redirects** JSON editor
(`customHttp.yml` is headers-only and cannot express redirects; the app auto-deploys from git
rather than from in-repo IaC, so redirects are console-managed). Map each old
`/learn/<old-slug>` to its new slug so existing links and bookmarks do not 404. Six mappings
(foundations→01, hardware→02, algorithms→03, quantum-ml→04, quantum-chemistry→05,
hybrid-jobs→06); `00-prereqs` is unchanged.

### Phase 0 verification

- `python scripts/validate_runnable.py --write-manifest` produces a manifest whose indices
  match the table above; `git diff` shows only the rename.
- `make test` (Python) green; `npm test` (web) green after slug fixes.
- `npm run build` emits the renamed `/learn/*` pages (page count unchanged).
- `grep -rI "00-foundations\|01-hardware\|02-algorithms\|03-quantum-ml\|04-quantum-chemistry\|05-hybrid-jobs"`
  over tracked, non-artifact files returns nothing.
- Redirects present for all six old URLs.

---

## Phase 1 — Intro Content Overhaul

### The narrative arc

The two modules become one story. `00-prereqs` builds intuition with no quantum machinery
(the *spun coin*: a classical bit lies flat as heads or tails; a qubit is a coin mid-spin —
it has a leaning, but you only ever see heads or tails when you stop it). `01-foundations`
opens by explicitly picking up that coin and asking: now that we can describe the spin, how
do we *act* on it, *combine* it, and *read* it? Every foundations concept is framed as a
verb applied to the state the prereqs taught the reader to write.

### `00-prereqs` (lighter touch — already warm)

Preserve its plain-English → code → notation → self-check structure and its existing voice.
Changes:
- Polish prose for momentum; tighten the six concept subsections.
- Convert the closing line ("…then you are ready for `00-foundations`") into a genuine
  narrative handoff into `01-foundations` (and fix the link target post-rename).
- Add one or two interactive beats (a live `qsim` near the qubit section; keep the existing
  `qscrub` and placement `quiz`).
- No structural reorder.

### `01-foundations` (full rewrite + resequence)

New section order (replacing today's Qubits → Single gates → Multi gates → Entanglement →
Measurement → Circuit model):

| # | Section | Rationale | Interactive payoff |
|---|---|---|---|
| 1 | Cold open | Hook and stakes, not "Learning Objectives." Callback to the spun coin. | — |
| 2 | The qubit, in one breath | Fast recall from prereqs; no re-derivation | live `qsim` of \|0⟩, \|+⟩ |
| 3 | Measurement — what "looking" costs | Moved early: the reader needs the Born rule and collapse before gates or entanglement carry weight | NEW **shots sampler** |
| 4 | Gates as rotations | Lead with Bloch-sphere geometry; matrices demoted to a reference table | `qscrub` 3D Bloch; NEW **Bloch build-a-state** |
| 5 | The circuit model | Moved up: the rules of the game, stated before the reader has "won" | `runnable` Braket cell |
| 6 | Two qubits & the gates that bind them | CNOT / CZ / SWAP / Toffoli, building toward the climax | `qsim` |
| 7 | Entanglement (the climax) | The payoff the whole module aims at | `qscrub` Bell build → NEW **correlation demo** → graded `qchallenge` |
| 8 | Check yourself | Consolidation, mirroring the prereqs placement quiz | `quiz` |
| 9 | Where this goes + Hands-On + References | Bridge to `02-hardware`; retain notebook list and references | — |

Learning Objectives and Prerequisites are compressed into a short header callout rather than
the opening act. The existing references and the hands-on notebook list are retained
(notebook filenames unchanged; only the parent directory is renamed in Phase 0).

### Voice & writing principles

- Open every section with motivation or a question, not a definition.
- Maintain a through-line: recurring example (build toward the Bell pair), callbacks to the
  coin, and forward references ("we will need this when…").
- Keep formalism, but as payoff after intuition: matrices and Dirac notation appear after the
  picture, presented as the precise version of what the reader already feels.
- Professional, vivid, emoji-free.

---

## New Widgets

All three live in `web/src/components/quantum/`, are client components, reuse `math.ts`
(state simulation, `probabilities`, `basisLabel`) and `state-readout.ts`
(`diracString`, `toPythonState`), and are registered in `markdown-renderer.tsx`'s `pre()`
override alongside the existing fences. `rehype-highlight` is already configured with
`ignoreMissing: true`, so new fence languages do not break the build. Each renders a graceful
error card on a parse error, matching `Quiz`/`Challenge`.

### 1. Shots sampler — ` ```qshots ` fence

- **Source:** the shared `qsim` DSL (a circuit, up to `MAX_QUBITS`). Computes exact
  Born-rule probabilities from the simulated state.
- **Behavior:** a shot-count control (presets 1 / 10 / 100 / 1,000 / 10,000) and a "Run"
  button. Each run samples that many outcomes from the categorical distribution and draws a
  histogram of empirical frequencies, with the exact probability drawn as a target marker per
  bar. As N grows the bars converge to the targets — the law of large numbers made visible.
- **Why:** today "measurement is probabilistic; more shots = better estimates" is asserted in
  prose with no demonstration.
- **Reduced motion:** no animated fill; render final bars directly. Empirical and exact values
  shown as text for screen readers.

### 2. Entanglement correlation demo — ` ```qcorr ` fence

- **Source:** JSON (parsed like `quiz`/`challenge`):
  `{ "prompt": "...", "entangled": "H 0\nCNOT 0 1", "product": "H 0\nH 1" }`. Both programs
  parse via the `qsim` DSL and must be two-qubit.
- **Behavior:** a "Measure" button samples one joint outcome; both qubit readouts light up to
  the sampled bit, and the result is appended to a running 2×2 correlation tally (00 / 01 /
  10 / 11). Two side-by-side panels — the entangled circuit and the product circuit — make the
  contrast undeniable: the Bell pair only ever yields 00 or 11 (perfect correlation), while the
  product state spreads across all four (independence).
- **Why:** "measuring one qubit instantly determines the other" is currently a sentence with no
  way to feel it.
- **Reduced motion:** instantaneous reveal; tally table is the primary, text-based artifact.

### 3. Bloch build-a-state — ` ```qbloch ` fence

- **Source:** none required (single qubit); optional initial `theta`/`phi` in the fence body.
- **Behavior:** θ (0…π) and φ (0…2π) sliders drive
  \|ψ⟩ = cos(θ/2)\|0⟩ + e^{iφ} sin(θ/2)\|1⟩. Renders the draggable 3D Bloch sphere
  (reusing `bloch-sphere-3d` with the `BlochDial` fallback for reduced-motion / no-WebGL) and
  shows the amplitudes, P(0)=cos²(θ/2), P(1)=sin²(θ/2), the Dirac string, and the gate
  sequence that produces the state from \|0⟩ (e.g. `RY θ` then `RZ φ`).
- **Why:** connects the abstract (θ, φ) parameterization to a concrete state, amplitudes, and
  the gates that realize it — reinforcing "gates are rotations."
- **Build note:** largely a composition of existing pieces (`BlochSphere3D` + sliders + the
  shared readouts), so the lowest-cost of the three.

### Widget integration & data flow

1. Author drops a fenced block into a `GUIDE.md`.
2. `MarkdownRenderer` parses Markdown; the `pre()` override inspects the code block's
   `language-*` class and routes `qshots`/`qcorr`/`qbloch` to the new components (as it
   already does for `qsim`/`qscrub`/`qchallenge`/`quiz`/`runnable`).
3. Each component parses its source (DSL via `qsim-dsl.ts`, or JSON), simulates with `math.ts`,
   and renders. No network, no SSR, no manifest involvement.

---

## Testing Strategy

- **Phase 0:** manifest regeneration diff review; `make test` and `npm test` green after slug
  updates; `npm run build` succeeds with renamed pages; redirect presence; grep for stale
  old-path references returns clean.
- **Phase 1 widgets:** Jest unit tests in `web/__tests__/components/` mirroring existing widget
  tests — parse-error card on malformed source; correct probabilities/labels from a known
  circuit; sampler convergence is deterministic enough to assert empirical counts sum to N and
  bars map to the right basis states; correlation tally only ever shows 00/11 for a Bell pair;
  build-a-state amplitudes match cos/sin at sampled (θ, φ). Reduced-motion path renders the
  static fallback.
- **Renderer:** a test that each new fence language routes to its component and unknown content
  degrades to a code block.
- **Content:** `npm run build` renders both rewritten GUIDEs without KaTeX/parse errors; manual
  dev-server pass for visual/interaction review; `npm run lint` clean.
- Update `CLAUDE.md`'s test/page counts if the totals change.

## Risks & Mitigations

- **URL changes break links/SEO** → 301 redirects in the Amplify Console (Rewrites and
  redirects) for all six old slugs; internal nav derives from the manifest and is unaffected.
- **Lab content path drift** (generated under `web/public/lab`) → rename the staging sources
  and regenerate via `build.sh`; confirm committed-vs-gitignored status before deciding whether
  to commit regenerated artifacts.
- **Hardcoded slugs in tests** → enumerated in the blast radius; update in the same PR as the
  rename.
- **Widget scope creep** → MVP behaviors are fixed above; richer modes are deferred.
- **Reordering loses required setup** → the resequence is validated section-by-section against
  "does concept N depend only on concepts < N"; measurement-before-entanglement and
  circuit-model-before-multi-qubit are the load-bearing moves.

## Build Sequence

1. Phase 0 rename PR: edit `SECTION_DIRS`, `git mv` dirs, fix staging scripts + cross-links +
   tests, regenerate manifest and lab, add redirects, verify, ship.
2. Phase 1 widgets: build `qbloch`, `qshots`, `qcorr` with tests; register in the renderer.
3. Phase 1 content: rewrite `00-prereqs/GUIDE.md` (polish + handoff) and `01-foundations/GUIDE.md`
   (full rewrite + resequence), embedding existing and new widgets at the beats above.
4. Verify (build, tests, lint, manual review); ship Phase 1 PR.
