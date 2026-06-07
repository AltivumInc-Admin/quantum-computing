# Hardware Module (02-hardware) Overhaul — Design Spec

## Overview

Raise `02-hardware` ("Quantum Hardware on Amazon Braket") from a competent device-catalog
reference into a compelling, interactive lesson. Unlike the `01-foundations` rescue, this
module's content is already solid, so the work is: (1) reflow the prose around a narrative
spine, and (2) add four new interactive widgets that *show* the realities the module currently
only describes — noise, limited connectivity, the device trade-off space, and cost.

Single phase, single PR (no rename/plumbing — that was Phase 0 of the intro overhaul).

## Goals

- Replace the spec-sheet catalog tone with a motivated narrative that builds from "real
  machines are noisy, sparsely wired, slow, and metered" to "here's how you choose one."
- Make the three signature ideas of the module *interactive*: noise (`qnoise`), connectivity
  and SWAP overhead (`qtopo`), and cost (`qcost`); plus an interactive device comparison
  (`qdevices`).
- Keep the accurate device/vendor content; tighten it into the narrative rather than rewrite
  from scratch.

## Non-Goals (Out of Scope)

- The six `02-hardware` notebooks (`.ipynb`) — they are hardware/API exercises, unchanged.
- Other modules' prose.
- Any live AWS/QPU calls from the browser. Per project rules (simulator-first, cost-aware), all
  widgets are pure-client simulations or calculators; nothing submits a task or queries Braket.
- Emoji / decorative ornamentation (clean professional register).

## Constraints

- Static export only (`output: "export"`); every widget is a client component, no SSR, no
  server runtime.
- Widgets are custom fenced code blocks routed by `web/src/components/markdown-renderer.tsx`,
  following the existing pattern (`qsim`/`qscrub`/`qchallenge`/`quiz`/`runnable`/`qbloch`/
  `qshots`/`qcorr`).
- Reuse the shared kernel `web/src/components/quantum/math.ts` (gate matrices, `Complex`,
  `Gate2`, `simulate`, `probabilities`, `basisLabel`) and the `qsim-dsl` parser where possible.
- All animations respect `prefers-reduced-motion`; all controls keyboard-accessible with ARIA,
  matching existing widgets.
- Cost figures mirror `lib/utils/cost.py` `PRICING` exactly (single source of truth) so the web
  calculator can never disagree with the Python helper.

---

## The Narrative Arc (resequenced)

Replaces the current catalog order (technologies → IonQ → IQM → QuEra → simulators → selection
→ cost). New order, each section opening with motivation and ending by setting up the next:

| # | Section | Rationale | Widget |
|---|---|---|---|
| 1 | Cold open | "You built flawless circuits on an ideal simulator. Real machines are noisy, sparsely wired, slow, and metered." Objectives/prereqs become a compact callout, not the opener. | — |
| 2 | Why there's no single "best" QC | The physics trade-off space and the axes that matter: connectivity, fidelity, coherence, speed, qubit count. | — |
| 3 | Noise — the defining reality of NISQ | Fidelity, depolarizing, amplitude damping, decoherence; watch a clean state degrade. The emotional core. | NEW **qnoise** |
| 4 | Connectivity — the wiring constraint | All-to-all vs nearest-neighbor; the SWAP-chain tax on distant interactions. | NEW **qtopo** |
| 5 | The three hardware families | IonQ (trapped ion), IQM (superconducting), QuEra (neutral-atom/analog) — each a point in the trade-off space, not a spec dump. Preserve the accurate vendor detail. | NEW **qdevices** |
| 6 | The simulator ladder — your defense | Local → SV1 (exact) → DM1 (noise) → TN1 (scale). Develop free, validate, study noise, scale. | reuse **qsim** |
| 7 | Cost — the discipline | Per-task / per-shot / per-minute; ties to the project's cost-awareness rules. | NEW **qcost** |
| 8 | Choosing a device | Synthesis: a short decision flow + a `quiz` to consolidate. | **quiz** |
| 9 | Hands-On + References | Preserve the notebook list and references; bridge to `03-algorithms`. | — |

Voice rules: open each section with motivation; carry a through-line back to "you built perfect
circuits — now meet reality"; keep formalism as payoff after intuition; professional, emoji-free.

---

## New Widgets

All live in `web/src/components/quantum/`, are client components, register in
`markdown-renderer.tsx`'s `pre()` override, and render a graceful error card on bad input
(mirroring `Challenge`/`Quiz`). Each ships with unit tests (pure logic in node env) and a
component render test (jsdom, mirroring existing widget tests; `window.matchMedia` is polyfilled
locally per the established pattern).

### 1. `qnoise` — noise visualizer (headline; highest build)

The current kernel is pure state-vector (noiseless). `qnoise` needs a small **density-matrix +
Kraus-operator** engine.

- **New module:** `web/src/components/quantum/noise.ts`
  - Density matrix as `Complex[][]` (2^n × 2^n); `n ≤ 3` (≤ 8×8) — enforce and error past that.
  - `densityFromZero(n)`, `applyGateDensity(rho, gate, qubit, n)` and a CNOT variant
    (ρ → UρU†, reusing `math.ts` gate matrices), `applyChannel(rho, channel, p, qubit, n)`
    (ρ → Σ_k K_k ρ K_k†), `measureProbs(rho)` (real part of the diagonal), `fidelity(idealProbs,
    noisyProbs)` (classical fidelity (Σ √(p_i q_i))² as the displayed "agreement", documented as
    a distribution-overlap measure, not state fidelity).
  - **Channels** (single-qubit Kraus sets):
    - Depolarizing(p): {√(1−p)·I, √(p/3)·X, √(p/3)·Y, √(p/3)·Z}; slider p ∈ [0, 0.75], where
      p = 0.75 drives one qubit to maximally mixed.
    - Amplitude damping(γ): {[[1,0],[0,√(1−γ)]], [[0,√γ],[0,0]]}; γ ∈ [0,1].
    - Bit-flip(p): {√(1−p)·I, √p·X}; p ∈ [0,1].
  - **Noise model:** after each gate, apply the selected channel to the qubit(s) that gate acted
    on (control + target for CNOT) — a "noisy gate" model, so deeper circuits degrade more.
- **Fence (`qnoise`):** the `qsim` DSL for the circuit; an optional first directive selects the
  default channel, e.g. body `channel depolarizing` then the circuit. (Channel is also switchable
  in the UI.)
- **UI:** channel selector + error-rate slider; **ideal vs noisy** probability bars (ideal from
  the existing state-vector `probabilities`, noisy from `measureProbs(rho)`); an agreement/fidelity
  readout. At p=0 the two match; as p rises, noisy bars flatten toward uniform. `not-prose` card
  chrome like `CircuitLab`. Reduced motion: static bars.
- **Tests:** depolarizing p=0 → noisy == ideal; single-qubit depolarizing p=0.75 → [0.5,0.5];
  amplitude damping γ=1 on a qubit prepared in |1⟩ → [1,0]; bit-flip p=1 on |0⟩ → |1⟩; engine
  rejects n>3.

### 2. `qtopo` — topology + SWAP routing

- **New module:** `web/src/components/quantum/topology.ts` — build adjacency for named topologies
  (`all-to-all`, `line`, `ring`, `grid`), BFS shortest path between two qubits, and the SWAP count
  to bring a non-adjacent pair adjacent — `(edges in shortest path) - 1` SWAPs — plus the resulting added depth.
- **Fence (`qtopo`, JSON):** `{ "topology": "grid", "qubits": 9, "gate": [0, 8] }` (gate = the two
  qubits you want to entangle). Validates topology name + qubit count + indices.
- **UI:** SVG node-and-edge graph of the topology; the requested control/target highlighted; the
  shortest SWAP path drawn; a readout of "N SWAPs added, depth +M." Optional control to pick the
  two qubits. `not-prose` card chrome. Reduced motion: static render.
- **Tests:** line(5) path 0→4 = 3 SWAPs; all-to-all = 0 SWAPs for any pair; grid(3×3) 0→8 shortest
  path length correct; invalid topology / out-of-range index → error result.

### 3. `qcost` — cost calculator

- **New module:** `web/src/components/quantum/cost.ts` — a `PRICING` table mirroring
  `lib/utils/cost.py` exactly (IonQ {task:0.30, shot:0.01}, IQM {0.30, 0.00145}, QuEra {0.30,
  0.01}, Rigetti {0.30, 0.00035}, SV1 {min:0.075}, DM1 {0.075}, TN1 {0.275}, LocalSimulator {0})
  and `estimateCost(provider, shots, minutes, tasks)` matching `estimate_cost` (per-shot devices:
  tasks × (per_task + per_shot × shots); per-minute devices: per_minute × minutes × tasks).
- **Fence (`qcost`):** no body required (defaults to IonQ); optional JSON to preset device/shots.
- **UI:** device dropdown, shots/tasks inputs (and minutes for managed sims), live itemized
  breakdown + total. Shows the "develop on Local (free) first" nudge. `not-prose` card chrome.
- **Tests:** IonQ 1000 shots, 1 task → $10.30; SV1 2 min → $0.15; LocalSimulator → $0; per-shot
  vs per-minute branch selection matches the Python helper; unknown provider → error.

### 4. `qdevices` — device comparison

- **Data:** a constant device list in the widget (technology, model, qubits, connectivity, native
  gates, gate-model y/n, cost model) drawn from the GUIDE's current content (IonQ Aria/Forte, IQM
  Garnet, QuEra Aquila, SV1/DM1/TN1, Local).
- **Fence (`qdevices`):** no body required; renders the full table.
- **UI:** sortable columns and a technology filter; highlight the analog (QuEra) row as
  non-gate-model. `not-prose` card chrome; semantic `<table>` with sortable `<th>` buttons (ARIA).
- **Tests:** renders all device rows; clicking a column header reorders; the filter narrows rows.

### Widget integration & data flow

1. Author drops a fence into the GUIDE.
2. `MarkdownRenderer`'s `pre()` inspects the `language-*` class and routes `qnoise`/`qtopo`/
   `qcost`/`qdevices` to the new components (as it already does for the eight existing fences).
3. Each component parses its source (qsim DSL or JSON), computes locally, renders. No network, no
   SSR, no manifest involvement.
4. A renderer routing test (`markdown-renderer.fence-routing.test.tsx`) gains four cases.

---

## Testing Strategy

- **Per widget:** pure-logic unit tests (node env) for `noise.ts`, `topology.ts`, `cost.ts`
  (cost asserted against the same numbers as the Python `estimate_cost`); component render tests
  (jsdom) for all four; routing tests for the four fences.
- **Content:** `npm run build` renders the reflowed `02-hardware` GUIDE with no KaTeX/parse errors
  and every fence mounting; `npm run lint` clean; manual dev-server pass exercising each widget in
  light/dark and reduced-motion.
- **Regression:** full `npm test` green (current 243 + new tests); `make test` (Python) unaffected.
- Update `CLAUDE.md` web test count if it changes.

## Risks & Mitigations

- **qnoise scope creep (a noise engine is real work)** → cap at n ≤ 3 qubits, three channels, the
  per-gate noise model above; density-matrix math is small at that size and exactly testable.
- **Cost drift between web and Python** → `cost.ts` mirrors `lib/utils/cost.py` `PRICING`; a test
  pins the canonical examples ($10.30, $0.15) so drift is caught.
- **Topology/routing over-engineering** → only the four named topologies + BFS shortest path; no
  full transpiler.
- **Widget bloat** → MVP behaviors fixed above; richer modes deferred.
- **nbstripout gotcha** → stage explicit paths on every commit; never `git add -A` (notebooks show
  perpetually "modified").

## Build Sequence

1. `qcost` + `cost.ts` (lowest risk, pins the cost contract).
2. `qdevices` (data + sortable table).
3. `qtopo` + `topology.ts` (graph + BFS).
4. `qnoise` + `noise.ts` (density-matrix/Kraus engine — highest build).
5. Renderer routing tests for the four fences.
6. GUIDE reflow: rewrite `02-hardware/GUIDE.md` to the narrative arc, embedding the widgets at
   their beats; preserve the notebook list + references.
7. Verify (full test suite, lint, build, manual pass); ship the PR.
