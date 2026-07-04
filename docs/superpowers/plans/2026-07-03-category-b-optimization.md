# Category B (Interactive Explorables) — Optimization Implementation Plan

**Date:** 2026-07-03
**Source:** `/plan B` over the open Category B items in `docs/feature-optimization.md`
**Verification:** 7 read-only agents verified all 21 open items against `main` (workflow
`wf_aee1db40-523`). 5 were already fixed (stale checkboxes, flipped with back-annotations:
L244/L284/L304/L324 via WS-6g #64, L306 via WS-6f #63); L320 remains SKIPPED by prior
adjudication (rules-of-hooks; clicks-only re-render). **16 genuinely open items** are
grouped below into 7 workstreams, each sized for one PR on the house pattern:
branch → `npm test` + `npm run lint` + `npm run build` → browser-check → squash-merge.

House constraints (all workstreams): no emojis in UI; Tailwind v4 `@theme` tokens, never
raw hex; every transition needs `motion-reduce` coverage; logic(.ts)/view(.tsx) split;
tests in `web/__tests__/components/quantum/` (`@jest-environment jsdom` docblock for
views, plain node for kernels, `@/components/quantum/...` alias); zero third-party
requests (e2e-enforced). Each PR flips its ledger checkboxes in the same branch.

---

## WS-1 — Accessibility batch (L329, L348, L349, L388)

### Objective
Close the four small, verified a11y gaps: indistinguishable side-by-side Bloch dials in
the encoding explorer, color-only curve encoding + missing legend entry in the PES
explorer, an impoverished `aria-valuetext` on the Hamiltonian R slider, and the missing
programmatic state on the active gate chip plus an AT-exposed decorative "py" badge.

### Prerequisites
- `cd web && npm ci` done; Jest suite green on `main` (~630 tests).
- Files to review first: `bloch-dial.tsx:40-47`, `encoding-explorer.tsx:132-147`,
  `pes-explorer.tsx:198-311`, `hamiltonian-explorer.tsx:106-111,184-250`,
  `widget-ui.tsx:29-41,126-132`.

### Step-by-Step Implementation
1. **BlochDial label prop** (`bloch-dial.tsx`)
   1.1. Add optional `labelPrefix?: string` (default `""`). The `role="img"` aria-label
        becomes `` `${labelPrefix}Bloch vector x ${x.toFixed(2)}, y ${y.toFixed(2)}, z ${z.toFixed(2)}` ``.
   1.2. Default must reproduce the current string exactly —
        `bloch-dial.test.tsx:29-33` asserts `getByLabelText(/y 1\.00/)` on a default dial.
2. **Encoding explorer per-dial labels** (`encoding-explorer.tsx:138-147`)
   2.1. Pass `labelPrefix="Qubit 0 reduced "` / `"Qubit 1 reduced "` to the two dials
        (keeps the numeric x/y/z — the Y-depth encoding is a deliberate a11y feature).
   2.2. Amplitude branch (`:132-136`): `labelPrefix="Single qubit "`.
3. **PES non-color cue + legend** (`pes-explorer.tsx`)
   3.1. Give the HF path (`:209-217` area) `strokeDasharray="6 3"` — distinct from the
        asymptote's existing `"3 3"` (`:198-207`).
   3.2. Legend (`:298-311`): make the HF swatch a mini inline SVG line carrying the same
        dasharray (copy the `inline-flex items-center gap-1.5` + aria-hidden swatch
        pattern); add a fourth entry — amber dot swatch + text `equilibrium` (this
        disambiguates the marker from the amber "STO-3G minimal basis" chip).
4. **Hamiltonian slider valuetext** (`hamiltonian-explorer.tsx:238-250`)
   4.1. Tapered mode: `ariaValueText` = `` `${angstromSR(R)}; c0 <v>, cz <v>, cx <v> hartree` ``
        from the `[R]`-memoized `taperedTerms` (`:191-198`), using the local `signed()`
        helper (`:106-111`) and `format.ts` SR conventions (lowercase units).
   4.2. Full 15-term mode: embed only the largest term (`fullTerms[0]`) — announcing 15
        coefficients on every step is spam.
   4.3. Keep it complementary to (not a duplicate of) the LiveStatus at `:227-234`.
5. **GateChip + py badge** (`widget-ui.tsx`)
   5.1. GateChip (`:29-41`): `aria-current={active ? "step" : undefined}` — React drops
        the attribute when undefined, so the non-scrubber consumers are unaffected. No
        visual change (`chip-selected` was contrast-tuned; `contrast-guard.test.ts` polices it).
   5.2. StateReadout py badge (`:126-132`): add `aria-hidden="true"` to the span. (The
        ledger's `state-readout.ts` citation is stale — the kernel has no JSX.)
6. Flip ledger checkboxes for L329/L348/L349/L388 with DONE date + PR number.

### File & Code Changes
| Action | File Path | Description |
|--------|-----------|-------------|
| Modify | `web/src/components/quantum/bloch-dial.tsx` | `labelPrefix` prop, default-preserving |
| Modify | `web/src/components/quantum/encoding-explorer.tsx` | Per-dial label prefixes |
| Modify | `web/src/components/quantum/pes-explorer.tsx` | HF dasharray, dashed legend swatch, equilibrium legend entry |
| Modify | `web/src/components/quantum/hamiltonian-explorer.tsx` | Enriched `ariaValueText` both modes |
| Modify | `web/src/components/quantum/widget-ui.tsx` | GateChip `aria-current="step"`; py badge `aria-hidden` |
| Modify | `web/__tests__/components/quantum/encoding-explorer.test.tsx` | `getByLabelText(/qubit 0/i)` + `/qubit 1/i` distinguishable |
| Modify | `web/__tests__/components/quantum/pes-explorer.test.tsx` | HF path has stroke-dasharray; legend includes `equilibrium` |
| Modify | `web/__tests__/components/quantum/hamiltonian-explorer.test.tsx` | Slider `aria-valuetext` matches `/c0|cz|cx/`; existing `R = `/`hartree` status asserts kept |
| Modify | `web/__tests__/components/quantum/widget-ui.test.tsx` | Active GateChip has `aria-current="step"`, inactive omits; py badge aria-hidden |
| Modify | `web/__tests__/components/quantum/wavefunction-scrubber.test.tsx` | Exactly one chip `aria-current` after a scrub (optional lock) |
| Modify | `docs/feature-optimization.md` | Flip L329/L348/L349/L388 |

### Testing & Validation
- Unit: the five test-file additions above; run `cd web && npm test && npm run lint && npm run build`.
- Manual: VoiceOver/SR spot-check on `/learn/04-quantum-ml` (qencode) and
  `/learn/05-quantum-chemistry` (qham, qpes); visual check of the PES legend/dashes in
  light + dark themes.
- Rollback: pure additive view props — revert the commit; no data or infra surface.

### Risk & Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Default BlochDial label drift breaks `bloch-dial.test.tsx` | Low | Low | Prefix-only design; existing test is the guard |
| Valuetext duplicates LiveStatus (double announcement) | Med | Low | Keep valuetext = coefficients, LiveStatus = mode + largest term |
| Dasharray visually collides with asymptote dash | Low | Low | `6 3` vs `3 3` + color difference; browser-check both themes |

### Dependencies & Order
Independent of all other workstreams. Do before WS-2 (both touch `bloch-dial.tsx`).

### Estimated Effort
- **Complexity:** Low — **Time:** 2–3 h — **Files:** 11

---

## WS-2 — Bloch 3D screen-reader equivalence + L246 disposition (L247, L246, L244 residual)

### Objective
Restore the Bloch-vector text equivalent when the 3D sphere replaces the dial (L247 — all
three consumers, including `scrolly-section`, which the ledger missed), close L246 as
mitigated-by-design with the verified analysis on record, and add the cold-cache loading
placeholder that removes the last transient CLS (L244 residual).

### Prerequisites
- WS-1 merged (shares `bloch-dial.tsx`).
- Read: `bloch-sphere-3d.tsx:103-127,171-181`, `bloch-builder-widget.tsx:11,44-54`,
  `wavefunction-scrubber.tsx:21,97-107`, `scrolly-section.tsx:30,51,103-106`,
  `format.ts`, `use-display-caps.ts` (module-scope caches).

### Step-by-Step Implementation
1. **Single-source the SR string** (`format.ts` + `format.test.ts`)
   1.1. Add `blochVectorSR({x,y,z})` returning exactly the dial's current
        `Bloch vector x <2dp>, y <2dp>, z <2dp>` string (existing
        `getByLabelText(/bloch vector/i)` queries keep passing).
   1.2. Point `bloch-dial.tsx` at it (compose with WS-1's `labelPrefix`).
2. **`BlochVectorSR` component** — export a tiny sr-only span component from
   `bloch-dial.tsx` (not inside `bloch-sphere-3d.tsx`: R3F Canvas cannot mount in jsdom,
   so the SR text must live outside the 3D module to be testable).
3. **Render it in the 3D branch of all three consumers** (`bloch-builder-widget.tsx`,
   `wavefunction-scrubber.tsx`, `scrolly-section.tsx` Explorable). Do NOT place it inside
   the parents' `role="status"` live column (`:44`/`:97`/`:106`) or every tick announces.
4. **L244 residual:** give the two `next/dynamic` imports (`bloch-builder-widget.tsx:11`,
   `wavefunction-scrubber.tsx:21`) a `loading: () => <div className="h-[180px] w-[180px] shrink-0" aria-hidden="true" />`
   so the first post-hydration flip to 3D can't collapse the box while the three.js chunk
   loads. (`scrolly-section`'s whole-layout swap is progressive enhancement by design — skip.)
5. **Tests** (per consumer): `jest.mock('@/components/quantum/use-display-caps')`
   (`useWebGL → true`, `usePrefersReducedMotion → false`) +
   `jest.mock('@/components/quantum/bloch-sphere-3d')` (stub default export), then assert
   the sr text renders in the 3D branch. Mocking the caps hooks sidesteps
   `use-display-caps`' module-scope caches.
6. **L246 disposition:** flip to `[x]` as mitigated/by-design with the analysis: KetLabels
   memoized (#64) + `frameloop="demand"` (#34) + drei 10.7.7's eps-gate skips DOM writes
   when positions are unchanged; during orbit drag the 6 writes are necessary (labels
   genuinely move); `occlude` would add per-frame raycasts, `sprite` forces the heavier
   CSS3D path, and drei `<Text>`/troika fetches its font from a CDN (violates the
   zero-third-party e2e). Record the single-overlay consolidation shape in the annotation
   as the future option if profiling ever shows label cost.
7. Flip L247 (+ L244's residual note) in the ledger.

### File & Code Changes
| Action | File Path | Description |
|--------|-----------|-------------|
| Modify | `web/src/lib/../components/quantum/format.ts` | `blochVectorSR` helper |
| Modify | `web/__tests__/components/quantum/format.test.ts` | Coverage for the new helper |
| Modify | `web/src/components/quantum/bloch-dial.tsx` | Use `blochVectorSR`; export `BlochVectorSR` sr-only component |
| Modify | `web/src/components/quantum/bloch-builder-widget.tsx` | SR span in 3D branch; dynamic `loading` placeholder |
| Modify | `web/src/components/quantum/wavefunction-scrubber.tsx` | Same two changes |
| Modify | `web/src/components/quantum/scrolly-section.tsx` | SR span beside the Explorable's 3D sphere |
| Modify | `web/__tests__/components/quantum/bloch-builder-widget.test.tsx` | Mocked-3D branch test |
| Modify | `web/__tests__/components/quantum/wavefunction-scrubber.test.tsx` | Mocked-3D branch test |
| Modify | `web/__tests__/components/quantum/scrolly-section.test.tsx` | Mocked-3D branch test |
| Modify | `docs/feature-optimization.md` | Flip L247; close L246 as mitigated; annotate L244 residual |

### Testing & Validation
- Unit: mocked-3D branch tests in all three consumers; `format.test.ts`.
- Manual (real WebGL, jsdom can't): `npm run build && npm run test:e2e` smoke, plus a
  VoiceOver pass on a WebGL device — the ⟨x,y,z⟩ readout must be announced with the 3D
  sphere showing.
- Rollback: additive sr-only spans + loading placeholder; revert commit.

### Risk & Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SR string drifts between dial and 3D branch | Low | Med | Single-sourced in `format.ts`, tested |
| 3D-branch tests flake via caps caches | Med | Low | Mock the hooks module, not `matchMedia` |
| Loading placeholder changes fallback-branch layout | Low | Low | Identical 180px box; browser-check |

### Dependencies & Order
After WS-1 (same file). Independent of WS-3..7.

### Estimated Effort
- **Complexity:** Low-Medium — **Time:** 2–3 h — **Files:** 10

---

## WS-3 — Test-teeth batch (L248, L289, L330, L389)

### Objective
Pin the verified-untested edge branches: the shots zero-bucket sampler guard, the
topology `swapCost` grid/degenerate/disconnected paths, both widget source parsers'
error branches, the vacuous VQC training assertion, `parse-utils`' remaining direct
gaps, and the `rng.ts` `gauss` log(0) guard — plus the mechanical RNG import
normalization and dead-code removal the audit flagged.

### Prerequisites
- Read: `shots.ts:9-29`, `topology.ts:28-60`, `topology-explorer.tsx:67-131` (9 error
  branches), `cost-calculator.tsx:9-26` (lenient parser), `barren-explorer.tsx:41-53`,
  `vqc-trainer.tsx:40-48,273`, `kernel-explorer.tsx:51,57`, `encoding-explorer.tsx:67,76`,
  `parse-utils.ts:44-96`, `rng.ts:27-29`.
- Conventions: kernel tests plain node env; widget tests jsdom docblock + the pasted
  `mockMatchMedia` helper where the widget reads reduced-motion.

### Step-by-Step Implementation
1. **shots.test.ts** (L248): `sampleIndex([0,.5,.5,0], () => 0) === 1` (r=0 hits the
   `probs[i] > 0` skip); `sampleCounts([0,.5,.5,0], N, () => 0)` leaves buckets 0 and 3
   at zero; tail fallback `sampleIndex([.5,.5,0], () => 0.9999999999999999) === 1`
   (last NONZERO bucket); one assertion through `correlation.ts`'s `sampleOutcome`
   re-export.
2. **topology.test.ts** (L289 kernel half): `swapCost("grid",9,0,8)` → 3 swaps;
   `swapCost(t,n,a,a)` → `{path:[a], swaps:0}`; disconnected via out-of-range **b**
   (e.g. `swapCost("line",4,0,9)`) → `{path:[], swaps:-1}`. Do NOT drive out-of-range
   `a` — `shortestPath` crashes on `adj[a]` undefined (component validates first; the
   kernel guard is defensive-only; adding one is optional scope, not planned).
3. **topology-explorer.test.tsx** (L289 parser half): one render per untested error
   branch (non-object, bad topology, qubits non-integer/<2, qubits > MAX_QUBITS, gate
   not 2-number array, non-integer indices, out-of-range, a===b), asserting the exact
   quoted literals (stable strings, e.g. `"gate" indices must be distinct`).
4. **cost-calculator.test.tsx** (L289): preset application `{"provider":"IQM","shots":500}`
   → IQM/500 preselected; `{"provider":"Nope","shots":-5}` and bad JSON → defaults
   IonQ/1000 and NO error card (lenient parser — assert the defaults).
5. **devices.test.ts** (L289 bonus): `sortDevices` string column (localeCompare) + asc.
6. **RNG import path** (L330): `barren-explorer.tsx:5` and `barren.test.ts:1` import
   `mulberry32` from `./rng` / `@/components/quantum/rng`; delete the `barren.ts:3`
   re-export (grep-verified: only those two importers).
7. **Error-card + de-vacuous tests** (L330): barren-explorer (all 4 branches — currently
   zero error tests), vqc-trainer (`unknown dataset`), kernel-explorer (`"dataset"`/
   `"map"` field branches), encoding-explorer (`"x"` two-number array + bad encoding).
   De-vacuous the VQC training test: training is a synchronous burst on click, so after
   `fireEvent.click(Train)` assert `getByRole("status")` matches `/step [1-9]/`
   (initial state reads `step 0`).
8. **parse-utils** (L389): switch `parse-utils.test.ts` to the `@/` alias (lone deviant);
   add direct describes for `readNumber` (missing-key fallback, wrong type, `1e999` →
   `'"key" must be a finite number'`, clamping) and `parseIndex`/`parseAngle` (the doc
   comments at `:72-96` enumerate the exact accept/reject sets, e.g. reject `-1`,
   `0abc`, `1.5` index; accept `03`→3, `-0.5`, `1e-3` angle). **Delete dead `numberOr`**
   (`:60-69`, zero consumers — removal beats testing, per house fail-loud style).
9. **rng.test.ts** (new, L389): `gauss(() => 0)` returns a finite number (pins the
   `1e-12` guard); `gauss` determinism with `mulberry32(seed)`; `mulberry32` output in
   `[0,1)` + per-seed determinism.
10. **De-dupe pasted RNG helpers**: `shots.test.ts:26-34` and `correlation.test.ts:39-47`
    import `mulberry32` from `@/components/quantum/rng` instead of local copies.
11. Flip L248/L289/L330/L389 in the ledger.

### File & Code Changes
| Action | File Path | Description |
|--------|-----------|-------------|
| Modify | `web/src/components/quantum/barren.ts` | Remove `mulberry32` re-export (line 3) |
| Modify | `web/src/components/quantum/barren-explorer.tsx` | Import `mulberry32` from `./rng` |
| Modify | `web/src/components/quantum/parse-utils.ts` | Delete dead `numberOr` |
| Create | `web/__tests__/components/quantum/rng.test.ts` | gauss guard + determinism + range |
| Modify | `web/__tests__/components/quantum/shots.test.ts` | Zero-bucket + tail-fallback pins; rng import |
| Modify | `web/__tests__/components/quantum/correlation.test.ts` | `sampleOutcome` pin; rng import |
| Modify | `web/__tests__/components/quantum/topology.test.ts` | swapCost grid/a==b/disconnected |
| Modify | `web/__tests__/components/quantum/topology-explorer.test.tsx` | 8 error-branch renders |
| Modify | `web/__tests__/components/quantum/cost-calculator.test.tsx` | Preset + lenient-fallback asserts |
| Modify | `web/__tests__/components/quantum/devices.test.ts` | sortDevices string/asc |
| Modify | `web/__tests__/components/quantum/barren.test.ts` | rng import path |
| Modify | `web/__tests__/components/quantum/barren-explorer.test.tsx` | 4 error-branch renders |
| Modify | `web/__tests__/components/quantum/vqc-trainer.test.tsx` | De-vacuous training assert; unknown-dataset error |
| Modify | `web/__tests__/components/quantum/kernel-explorer.test.tsx` | dataset/map error branches |
| Modify | `web/__tests__/components/quantum/encoding-explorer.test.tsx` | x-array + encoding error branches |
| Modify | `web/__tests__/components/quantum/parse-utils.test.ts` | Alias import; readNumber/parseIndex/parseAngle describes |
| Modify | `docs/feature-optimization.md` | Flip L248/L289/L330/L389 |

### Testing & Validation
- The PR **is** tests; gate on full `npm test` + `npm run lint` + `npm run build`.
- Verify the two src changes are behavior-neutral: `numberOr` has zero consumers
  (re-grep before deleting); the re-export removal compiles (only 2 importers updated).
- Rollback: revert; src changes are two mechanical lines.

### Risk & Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Error-string literals drift from asserts | Low | Low | Copy strings verbatim from source at write time |
| A "dead" export has an unseen consumer | Low | Med | Re-grep `numberOr` across web/src + lab build scripts before deleting |
| Float edge in tail-fallback test differs per platform | Low | Low | Use the verified constant `0.9999999999999999` |

### Dependencies & Order
Independent. Ship **before WS-4** (its pins protect the Bar refactor) and before WS-5/6
(barren-explorer import line churn — trivial either way).

### Estimated Effort
- **Complexity:** Medium — **Time:** 3–5 h — **Files:** 17

---

## WS-4 — ProbBars consolidation tail (L229)

### Objective
Finish the bar-row single-sourcing: extend the shared `Bar` primitive to cover the
empirical-fill + exact-marker + two-tone-readout variants, rewrite the last two
hand-rolled bar rows (shots-sampler, correlation-demo) on it, and — explicit adjacent
scope — migrate shots-sampler's hand-rolled card shell/header/error card to
`WidgetCard`/`ErrorCard` (the one widget the WS-6c sweep missed). Correlation gains the
missing `motion-reduce` guard as a side effect.

### Prerequisites
- WS-3 merged (sampler pins in place).
- Read: `widget-ui.tsx:60-116` (Bar/ProbBars), `shots-sampler.tsx:7,38-51,58-80,118-179`,
  `correlation-demo.tsx:51-78,145-149`, `widget-ui.test.tsx:32-88`.

### Step-by-Step Implementation
1. **Extend `Bar`** (`widget-ui.tsx`), preserving all current call sites:
   1.1. `valueText: string` → `ReactNode` (carries two-tone readouts).
   1.2. `valueWidth?: string` default `"w-12"` (same pattern LabeledSlider already
        exposes); both new consumers pass `"w-24"`.
   1.3. `marker?: { fraction: number; title?: string }` — renders the
        `absolute top-0 bottom-0 w-0.5` vertical line inside the track, positioned via
        `left:%`; track gets `overflow-visible` **derived from marker presence** (at
        p=100% the 2px marker pokes past the edge; clipping would hide it), else the
        current `overflow-hidden`.
   1.4. `ariaLabel?: string` row-level (shots sets a conditional row aria-label today).
   1.5. Track height stays `h-3` — unify shots' `h-4` down (tiny deliberate visual
        change; that IS the one-source-of-truth intent). Label column unifies `w-10`→`w-12`.
2. **Rewrite `shots-sampler.tsx:118-166`** as a map over `Bar`: empirical fill
   `fillClass="bg-accent/70"` (gains the shared width transition + motion-reduce guard),
   `marker={{fraction: exactP, title}}`, two-tone `valueText` node using `formatPercent`
   (per PR #79 single-sourcing), per-row `ariaLabel`. Legend rows (`:169-179`) stay
   caller-side.
3. **Rewrite `correlation-demo.tsx:51-78`** Panel rows as `Bar`: count/percent two-tone
   `valueText`, `valueWidth="w-24"`. Side effects to accept: gains
   `motion-reduce:transition-none` (a fix — currently missing at `:62`) and 150ms→200ms
   transition (unification). Keep the tally table non-live (`:145-149` is deliberate).
4. **Adjacent migration (separate commit, same PR):** shots-sampler's hand-rolled card
   shell/header/parse-error card → `WidgetCard`/`EyebrowLabel`/`ErrorCard`.
5. **Tests**: `widget-ui.test.tsx` — marker renders with `left` style + title,
   `overflow-visible` present only with marker, `valueWidth` applied, ReactNode
   valueText renders, row ariaLabel set; existing fill selectors survive (fill stays
   first-in-DOM). `shots-sampler.test.tsx` — add a marker-presence assertion; existing
   behavior tests unchanged. If the WidgetCard migration lands, update the error-card
   assertion to the shared `getByText(/shots error:/i)` shape.
6. Flip L229 with DONE date + notes on the two visual unifications.

### File & Code Changes
| Action | File Path | Description |
|--------|-----------|-------------|
| Modify | `web/src/components/quantum/widget-ui.tsx` | Bar: ReactNode valueText, valueWidth, marker, ariaLabel, derived overflow |
| Modify | `web/src/components/quantum/shots-sampler.tsx` | Rows → `Bar`; card shell/header/error → shared components |
| Modify | `web/src/components/quantum/correlation-demo.tsx` | Tally rows → `Bar` |
| Modify | `web/__tests__/components/quantum/widget-ui.test.tsx` | New Bar API coverage |
| Modify | `web/__tests__/components/quantum/shots-sampler.test.tsx` | Marker assert; error-card shape if migrated |
| Modify | `web/__tests__/components/quantum/correlation-demo.test.tsx` | Verify behavior tests still pass (no markup pins) |
| Modify | `docs/feature-optimization.md` | Flip L229 |

### Testing & Validation
- Unit suite + lint + build.
- **Browser-check required** (visual unifications): `/learn/01-foundations` — qshots
  (marker visible at p=1.0 edge, h-4→h-3, transitions) and qcorr (tally rows) in light +
  dark, plus a reduced-motion pass (`prefers-reduced-motion` in DevTools rendering tab).
- Rollback: revert commit; shared-Bar extensions are additive so other widgets are
  unaffected either way.

### Risk & Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Marker clipped at 100% | Med | Low | Derived `overflow-visible` with marker; browser-check at maxed slider |
| Existing widget-ui fill-selector tests break | Low | Low | Fill span stays first-in-DOM; marker targeted explicitly in new tests |
| Height/label-width unification reads as regression | Low | Low | Called out in PR body + ledger note; it is the item's intent |

### Dependencies & Order
After WS-3. Independent of WS-1/2/5/6/7 (only overlap is `widget-ui.tsx` with WS-1's
GateChip edit — different components, merge-trivial; still, land WS-1 first).

### Estimated Effort
- **Complexity:** Medium — **Time:** 3–4 h — **Files:** 7

---

## WS-5 — Shared chart scaffolding `chart-utils.ts` (L402 core)

### Objective
Extract the pure chart math re-derived in five hand-rolled line charts (barren, pes,
metrics, vqe, vqc-trainer) into a tested `chart-utils.ts` kernel — single-pass `extent`,
`linearScale`, `linePath`/`polylinePoints`, and a `Plot` frame type — leaving each
chart's output pixel-identical.

### Prerequisites
- Read: `barren-explorer.tsx:20,65-81,115-116,164-207`, `pes-explorer.tsx:23,68-89,284-294`,
  `metrics-explorer.tsx:31,186-199`, `vqe-explorer.tsx:33,108-126,259-272`,
  `vqc-trainer.tsx:30-31,155-169`.
- Verified facts: no chart helper exists (zero grep hits for linearScale/extent);
  jsdom tests assert text/roles, never SVG geometry — refactor risk is low; the user
  browser-verifies pixels, so per-site `toFixed` precision must be preserved exactly.

### Step-by-Step Implementation
1. **Create `web/src/components/quantum/chart-utils.ts`** (pure kernel, no React):
   1.1. `extent(values: number[]): { min: number; max: number }` — single pass (also
        removes the spread-on-large-array footgun); document the non-empty precondition.
   1.2. `linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number`
        — document degenerate `d1===d0` behavior (callers already pad ranges).
   1.3. `linePath(pts: {x:number,y:number}[], digits = 2): string` — `M x,y L x,y …`.
   1.4. `polylinePoints(pts, digits = 1): string` — `"x,y x,y …"` (barren keeps its
        `<polyline>` + 1-digit precision → pixel-identical).
   1.5. `type Plot = { w: number; h: number; padL: number; padR: number; padT: number; padB: number }`
        + `plotInner(p: Plot): { innerW: number; innerH: number }` — share the shape,
        NOT the numbers (padding genuinely differs per chart: padL 40/44/10).
2. **`chart-utils.test.ts`** (node env, format.test.ts style): extent incl. negatives
   and single-element; linearScale endpoints/midpoint/inverted range; linePath +
   polylinePoints exact strings at both digit settings; plotInner arithmetic.
3. **Adopt per chart** (mechanical, one commit each or one sweep):
   3.1. `barren-explorer.tsx`: `SVG` const → `Plot`; `project()` → two `linearScale`s +
        `plotInner`; `polyline()` → `polylinePoints(pts, 1)`; `:115-116` two-pass spread
        → `extent(allLogs)`. Decade gridlines/labels stay local (chart-specific).
   3.2. `pes-explorer.tsx`: `PLOT` → `Plot`; `sx/sy` → `linearScale`; `toPath` →
        `linePath(pts, 2)`; `:75-76` → `extent`. All inside its existing `useMemo`.
   3.3. `metrics-explorer.tsx`: `PLOT` → `Plot`; `sx/sy` → `linearScale`; `linePath`/
        `previewPath` builders → `linePath` (memoization itself is WS-6).
   3.4. `vqe-explorer.tsx`: `SVG` → `Plot`; `thetaToX/energyToY` → `linearScale`;
        `curvePath` → `linePath` (already `[parsed]`-memoized; extent already single-pass — leave).
   3.5. `vqc-trainer.tsx` LossCurve: `:158-159` → `extent`; `:162-168` → `linePath`.
   3.6. Do NOT extract an `<AxisLabels>` view component — only 2 congruent rotated-label
        sites; the axis internals (decade gridlines, floor line) are chart-specific.
4. Flip/annotate L402 (this closes its core; the perf clause closes in WS-6 — split the
   ledger line accordingly or flip after WS-6).

### File & Code Changes
| Action | File Path | Description |
|--------|-----------|-------------|
| Create | `web/src/components/quantum/chart-utils.ts` | extent/linearScale/linePath/polylinePoints/Plot/plotInner |
| Create | `web/__tests__/components/quantum/chart-utils.test.ts` | Full kernel coverage |
| Modify | `web/src/components/quantum/barren-explorer.tsx` | Adopt helpers, keep polyline + 1-digit |
| Modify | `web/src/components/quantum/pes-explorer.tsx` | Adopt helpers inside existing memo |
| Modify | `web/src/components/quantum/metrics-explorer.tsx` | Adopt helpers |
| Modify | `web/src/components/quantum/vqe-explorer.tsx` | Adopt helpers |
| Modify | `web/src/components/quantum/vqc-trainer.tsx` | Adopt helpers in LossCurve |
| Modify | `docs/feature-optimization.md` | Annotate L402 core done |

### Testing & Validation
- `chart-utils.test.ts` + full suite + lint + build.
- Pixel parity: browser-check qbarren, qpes, qmetrics charts against production
  (quantum.altivum.ai) side-by-side — paths must be visually identical (same `toFixed`
  digits guarantee identical `d`/`points` strings for identical inputs).
- Rollback: revert; helpers are additive, adoptions are per-file.

### Risk & Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sub-pixel drift from changed rounding | Low | Med | Preserve per-site digits (1 vs 2); string-compare a sample path pre/post in a scratch test |
| Scale edge-cases (empty/degenerate domain) | Low | Low | Document preconditions; callers already guard; kernel tests pin |
| Over-abstraction creep (axis JSX) | Med | Low | Explicitly out of scope; helpers are pure math only |

### Dependencies & Order
Independent. Land **before WS-6** (same files; WS-6 builds on the adopted helpers).

### Estimated Effort
- **Complexity:** Medium — **Time:** 3–5 h — **Files:** 8

---

## WS-6 — Chart/compute perf residuals (L402 perf clause + L327 remainder)

### Objective
Kill the three verified live rebuild/synchronous-recompute paths: metrics-explorer's
full-history `previewPath` rebuilt every streaming tick, kernel-explorer's 1296 boundary
rects + 60 point circles rebuilt on every render while the deferred slider lags, and
barren-explorer's synchronous full sweep on every depth-slider tick — plus the
`kernelBias` → `kernelBiasS` delegation nit.

### Prerequisites
- WS-5 merged (same files, helpers in place).
- The house deferral pattern (canonical: `kernel-explorer.tsx:108-110,142,166-167`,
  shipped WS-5c): `useDeferredValue(control)` feeding the heavy memo, immediate value on
  the control/label, `aria-busy={v !== deferredV}` + `transition-opacity`/`opacity-60`
  dim while catching up.

### Step-by-Step Implementation
1. **metrics-explorer**: move `sx`/`sy` + `previewPath` (`:186-199` pre-WS-5 lines) into
   a `useMemo` keyed `[history, yLo, yHi]` — the full-history preview curve is
   interaction-invariant per run yet currently rebuilds every `STREAM_MS` `setShown`
   tick. The live `linePath` (shown prefix) stays in the render body (it genuinely
   changes per tick).
2. **kernel-explorer**: hoist the boundary-cell `<rect>` array + training-point circles
   (`:170-199`) and their `cell/px/py` scales into a `useMemo` keyed `[result, train]`
   (the qaoa heat-memo treatment, #64's proven pattern) — stable element references let
   React bail out per-fiber during the `deferredScale` lag renders.
3. **barren-explorer**: `const deferredDepth = useDeferredValue(depth);` re-key the sweep
   memo (`:93-104`) on `[deferredDepth, samples]`; slider + `depth = {depth}` Chip stay
   on the immediate value; add `aria-busy={depth !== deferredDepth}` +
   `transition-opacity ${...opacity-60}` on the plot `<svg>` (`:149-155`). **Keep the
   hook above the parse-error early return** (`:106`) — rules-of-hooks; do not reorder.
   The `role="status"` variance readout derives from `sweep`, so plot + readout lag
   together (consistent).
4. **kernel.ts DRY nit**: `kernelBias` body →
   `return kernelBiasS(train.map((p) => featureState(p.x, map, scale)), train);`
   (matches the `kernelScore`→`kernelScoreS` delegation precedent; equivalence test at
   `kernel.test.ts:23-26` already pins it).
5. Flip L327 and L402's perf clause in the ledger.

### File & Code Changes
| Action | File Path | Description |
|--------|-----------|-------------|
| Modify | `web/src/components/quantum/metrics-explorer.tsx` | Memoize previewPath + scales on `[history, yLo, yHi]` |
| Modify | `web/src/components/quantum/kernel-explorer.tsx` | Memoize boundary rects + points on `[result, train]` |
| Modify | `web/src/components/quantum/barren-explorer.tsx` | `useDeferredValue(depth)` + aria-busy/dim |
| Modify | `web/src/components/quantum/kernel.ts` | `kernelBias` delegates to `kernelBiasS` |
| Modify | `docs/feature-optimization.md` | Flip L327; close L402 |

### Testing & Validation
- Existing behavior tests must stay green (they assert text/roles; deferred values
  settle synchronously in test env — do NOT assert the transient busy state, it's
  test-flaky by nature).
- `kernel.test.ts` equivalence test pins the delegation.
- Manual: browser-check qbarren depth slider (stays responsive, plot dims then updates),
  qmetrics streaming (no jank), qkernel scale scrub.
- Rollback: revert; all four changes are local and behavior-preserving at rest.

### Risk & Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hook-order violation in barren-explorer | Med | High (crash) | Insert `useDeferredValue` beside existing hooks above the early return; lint's rules-of-hooks catches it |
| Memo keys miss a real dependency (stale chart) | Low | Med | exhaustive-deps lint; manual scrub-through of each affected widget |
| Busy-state assertions flake | Med | Low | Don't test the transient; test final state only |

### Dependencies & Order
After WS-5 (same files). Independent of WS-1..4, WS-7.

### Estimated Effort
- **Complexity:** Low-Medium — **Time:** 2–3 h — **Files:** 5

---

## WS-7 — Control-token + markup cleanup (L288, L370, optional L307 tail)

### Objective
Unify the three form-control background/border treatments across the four hardware
widgets onto the already-exported-but-never-adopted `fieldClass` token, and collapse
job-explorer's duplicated CompareBar sub-bar markup into one parameterized local
component.

### Prerequisites
- Read: `widget-ui.tsx:240-241` (`fieldClass`, zero consumers), `device-table.tsx:59`,
  `noise-visualizer.tsx:176`, `cost-calculator.tsx:97,123,144,164`,
  `topology-explorer.tsx:347,363`, `job-explorer.tsx:147-228`.
- Tailwind gotcha that shapes the design: conflicting utilities appended after a class
  string do NOT reliably win (stylesheet order, not class order, decides).

### Step-by-Step Implementation
1. **Reshape `fieldClass`** (safe — zero consumers today): strip sizing/text-size out,
   keeping `rounded-control border border-gray-200 dark:border-gray-700 bg-white
   dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus-ring`; each call site appends
   its own sizing (`px-2 py-1 text-xs` for device-table/noise/topology,
   `px-2 py-1.5 text-sm` for cost-calculator).
2. **Adopt in all 8 control instances**: `device-table.tsx:59`,
   `noise-visualizer.tsx:176` (keep its `flex-1`), `cost-calculator.tsx:97,123,144,164`
   (deliberate visual change: loses the gray-50/gray-800-60 fill),
   `topology-explorer.tsx:347,363` (deliberate: loses the translucent dark border).
   That IS the point of the item — one treatment.
3. **job-explorer SubBar**: extract file-private
   `SubBar({ title, valueText, frac, ariaLabel, barColor, transition, className })`
   rendering the label/value row + `role="img"` track + inline-styled fill; CompareBar
   renders it twice (className carries the `mt-2`/`mt-2.5` delta). Keep: the inline
   `transition: "none"` reduced-motion override threaded from `reduced` (`:168`),
   `motion-reduce:transition-none` on the fill, per-track aria-labels, and the sr-only
   combined summary (`:225`). Do NOT reuse the shared `Bar` — its single-row |label⟩ +
   class-fill contract doesn't fit this stacked, inline-styled layout.
4. **Optional L307 tail** (verify its ledger text first): qft-visualizer's ErrorCard
   `className="my-8"` → the `my-6` default, closing the margin delta the L307 PARTIAL
   note left open. One line; update L307's annotation if taken.
5. Flip L288/L370 (and optionally L307) in the ledger.

### File & Code Changes
| Action | File Path | Description |
|--------|-----------|-------------|
| Modify | `web/src/components/quantum/widget-ui.tsx` | Reshape `fieldClass` (no sizing) |
| Modify | `web/src/components/quantum/device-table.tsx` | Adopt fieldClass |
| Modify | `web/src/components/quantum/noise-visualizer.tsx` | Adopt fieldClass (+flex-1) |
| Modify | `web/src/components/quantum/cost-calculator.tsx` | Adopt fieldClass ×4 |
| Modify | `web/src/components/quantum/topology-explorer.tsx` | Adopt fieldClass ×2 |
| Modify | `web/src/components/quantum/job-explorer.tsx` | Extract `SubBar`, render ×2 |
| Modify | `web/__tests__/components/quantum/job-explorer.test.tsx` | `getByRole('img', { name: /wall-clock/ })` extraction lock |
| Modify | `web/src/components/quantum/qft-visualizer.tsx` | (Optional) my-8 → default margin |
| Modify | `docs/feature-optimization.md` | Flip L288/L370 (+L307 note) |

### Testing & Validation
- Suite + lint + build (no class-string assertions exist on these controls — verified).
- **Browser-check required** (visual change): `/learn/02-hardware` all four widgets,
  light + dark — controls share one treatment; `/learn/06-hybrid-jobs` qjob compare
  bars unchanged pixel-wise; reduced-motion pass on the compare bars.
- Rollback: revert commit.

### Risk & Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tailwind class-order conflict (sizing baked into token) | Med | Med | Designed out: token carries no sizing; call sites own it |
| Perceived visual regression on cost/topology controls | Med | Low | Deliberate + called out in PR body with before/after screenshots |
| SubBar refactor changes bar markup semantics | Low | Low | Markup-preserving; new role="img" name test locks it |

### Dependencies & Order
Independent; `widget-ui.tsx` overlap with WS-1/WS-4 is disjoint (different exports) —
rebase-trivial. Can ship any time.

### Estimated Effort
- **Complexity:** Low — **Time:** 1.5–2 h — **Files:** 9

---

# MISSION BRIEF

**Overview:** Close out Category B — 16 verified-open refinements across the explorables,
grouped into 7 single-PR workstreams: two a11y passes, a test-teeth pass, the ProbBars
consolidation tail, a pure chart-math extraction, the last perf residuals, and a
control-token/markup cleanup. Five stale ledger checkboxes were already flipped during
verification (no code needed).

**Execution Order (4 independent tracks; within a track, sequential):**
1. **Track A:** WS-1 (a11y batch) → WS-2 (Bloch 3D SR + L246 closure) — shared `bloch-dial.tsx`
2. **Track B:** WS-3 (test teeth) → WS-4 (ProbBars tail) — pins land before the Bar refactor
3. **Track C:** WS-5 (chart-utils) → WS-6 (perf residuals) — same chart files
4. **Track D:** WS-7 (cleanup) — any time

**Decision Points:**
- WS-2: accept the recommendation to close L246 as mitigated-by-design (the code
  alternative — a single consolidated overlay — is recorded in the ledger for later)?
- WS-4: include the shots-sampler WidgetCard/ErrorCard migration (adjacent scope,
  separate commit, recommended) and accept the two tiny visual unifications (h-4→h-3
  track, w-10→w-12 label)?
- WS-7: take the optional one-line L307 margin tail? Accept the deliberate control
  restyle on cost-calculator/topology-explorer?

**Total Estimated Effort:** ~17–25 h across 7 PRs; 5 create + ~55 modify file-touches;
all local-simulator/web work, no QPU or infra surface.
