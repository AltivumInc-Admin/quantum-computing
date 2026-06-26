# WS-6 Implementation Plans — Explorables Features 6-12

> Detailed `/plan`-format implementation plans for the 8 work packages (WS-6a..6h)
> derived from the 2026-06-25 deep audit of the interactive explorables (Features
> 6-12). Source findings: `docs/feature-optimization.md` (items tagged `added 2026-06-25`).
> Generated 2026-06-25 by an 8-agent planning workflow, each grounded in current code.
>
> Each package maps to one reviewable PR following the WS-branch cadence
> (branch off main -> implement -> `cd web && npm run lint && npm test && npm run build`
> -> squash PR -> merge when green). See the Mission Brief at the bottom for execution
> order and cross-package decision points.

## Contents

- **WS-6a** — Correctness bugs (3 teaching/output bugs)
- **WS-6b** — LiveStatus a11y sweep (announce computed results to screen readers)
- **WS-6c** — Shared shell + slider primitives (WidgetCard / EyebrowLabel / Chip / LabeledSlider)
- **WS-6d** — Finish the ProbBars consolidation
- **WS-6e** — Caption contrast token (WCAG AA)
- **WS-6f** — Resilience & smaller correctness
- **WS-6g** — Performance & CLS
- **WS-6h** — Single-sourcing & consistency tail

---

### WS-6a — Correctness bugs (3 teaching/output bugs)

#### Objective
Three audit-confirmed correctness defects make widgets contradict their own teaching copy or print malformed output. When done: (1) the VQE energy landscape (`vqe-explorer.tsx`) plots lower energy LOWER, so Optimize visibly slides the marker DOWN to the variational floor, matching the widget's prose and the sibling `pes-explorer.tsx` orientation; (2) the Jordan-Wigner explorer (`jw-explorer.tsx`) no longer claims a phantom "q0 through q0" Z-string for the default `mode = 0` view where no Z-string exists; (3) `diracString` (`state-readout.ts`) renders signed sums correctly (`0.71|0⟩ - 0.71|1⟩`) instead of the broken `0.71|0⟩  +  -0.71|1⟩`, fixing every consumer of `StateReadout` plus `encoding-explorer.tsx`. No behavior, prop, or call-site signatures change.

#### Prerequisites
- Node toolchain already used by the repo (`cd web && npm ci` if `node_modules` is stale); no new packages.
- Branch off fresh `main` (branch-protected; 3 CI checks). House rules: no emojis in UI/code; match existing Tailwind token usage and component conventions.
- Knowledge: SVG y grows downward (so "lower energy = larger y = nearer the bottom"); the JW Z-string occupies modes `0..p-1` and is empty for `p = 0` (`jw.ts:51`, `zChain = Array.from({length: mode})`); `formatAmplitude` returns a bare leading `-` only for negative real-only (`state-readout.ts:17`) or negative imaginary-only (`:18`) amplitudes, and paren-wraps the compound `(r±im i)` form (`:19`) so it never starts with `-`.
- Correction to the audit brief: `web/__tests__/components/quantum/state-readout.test.ts` ALREADY EXISTS (it currently tests `formatAmplitude` and `diracString`). This package EXTENDS it rather than creating it. Likewise a `vqe-explorer.test.tsx` already exists and will be extended.
- These widgets are surfaced from fenced blocks (`qvqe`, `qjw`, `qpes` in `web/src/components/quantum/widget-langs.ts` + `widget-fence.tsx:55-90`) on the `/learn/05-quantum-chemistry` page (built from `05-quantum-chemistry/GUIDE.md`).

#### Step-by-Step Implementation

**1. Bug (1): flip the VQE energy y-map so lower energy is lower — `web/src/components/quantum/vqe-explorer.tsx`.**

1.1. Locate the y-mapper at lines 139–140:
```ts
const energyToY = (e: number) =>
  SVG.padY + ((e - eMin) / span) * plotH;
```
This maps `eMin -> padY` (TOP), which draws the minimum/floor at the top — upside down.

1.2. Replace it with the orientation used by `pes-explorer.tsx:112` (`sy = padT + ((yHi - E)/(yHi - yLo)) * innerH`), mapping high energy to the top and low energy to the bottom:
```ts
const energyToY = (e: number) =>
  SVG.padY + ((eMax - e) / span) * plotH;
```
Keep `span = Math.max(1e-9, eMax - eMin)` (line 135) unchanged. Note: `eMin` is still referenced by `span`, and `eMax` is now referenced by `energyToY`, so both destructured names (line 124) remain used — no `no-unused-vars` lint error.

1.3. Do NOT touch any other geometry: `curvePath` (142–148), `markerY` (151), `floorY` (152), the floor `<line>` (252–262), the drop-line `<line>` (298–307), and the floor `<text>` (263–272) all derive from `energyToY`, so they invert automatically and stay mutually consistent. The theta tick `<text>` (274–286) is on the x-axis (`y = SVG.h - 3`) and is energy-independent — leave it.

1.4. Update the now-stale orientation comment at line 134 from:
```ts
// Plot geometry: theta on x, energy on y (inverted, lower = nearer the floor).
```
to an unambiguous statement matching the new code, e.g.:
```ts
// Plot geometry: theta on x; energy on y mapped so HIGHER energy is nearer the
// top and LOWER energy (the variational floor) is nearer the bottom — SVG y grows
// downward, so e=eMax -> padY (top) and e=eMin -> padY+plotH (bottom).
```

1.5. Verify the floor LABEL placement (lines 263–272, `y={floorY - 4}`, `textAnchor="end"`, `fontSize={8}`). After the flip, `floor ≈ eMin` maps near the bottom: `floorY ≈ SVG.padY + plotH = 170 - 14 = 156` (and at most a few px below if the analytic `floor` is slightly under the sampled `eMin`, since `floor ≤ eMin`). The label baseline at `floorY - 4 ≈ 152` sits just ABOVE the floor line, inside the plot, well clear of both the top edge and the x-axis tick labels at `y = 167`. Keep `floorY - 4` (label above the line reads correctly as the floor's caption). No offset change is required; confirm visually in step 5.

**2. Bug (2): gate the JW Z-string paragraph on `zChain.length > 0` — `web/src/components/quantum/jw-explorer.tsx`.**

2.1. The inline formula span already gates correctly on `image.zChain.length > 0` (lines 304–309). The plain-English paragraph (lines 342–349) does NOT — it unconditionally renders `(q0 through q{activeMode > 0 ? activeMode - 1 : 0})`, which for the default `DEFAULT_CONFIG.mode = 0` (lines 34–39) prints "q0 through q0", asserting a Z on q0 that does not exist (`jw.ts:51` makes `zChain` empty for mode 0; q0 carries X/Y).

2.2. Replace the single paragraph (342–349) with a branch on the SAME condition `image.zChain.length > 0`. Reuse the existing `sign` variable (line 166, `image.ySign < 0 ? "−" : "+"`, U+2212 minus) so the mode-0 copy stays accurate to the creation/annihilation toggle. Keep the shared closing sentence outside the branch:
```tsx
<p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
  {image.zChain.length > 0 ? (
    <>
      The trailing Z-string counts the parity of every lower-index orbital
      (q0 through q{activeMode - 1}). That product of Z operators is what
      encodes fermionic antisymmetry: flipping occupation on mode {activeMode}{" "}
      must respect the sign of how many electrons sit below it.{" "}
    </>
  ) : (
    <>
      Mode 0 has no lower-index orbitals, so there is no trailing Z-string — the
      operator is just (X {sign} iY) / 2 on q0. The parity bookkeeping appears
      only for higher modes.{" "}
    </>
  )}
  The mapping is exact and deterministic — pure combinatorics, big-endian with
  qubit 0 on the left.
</p>
```
Edge cases handled: with `activeMode > 0` guaranteed inside the truthy branch, the old `activeMode > 0 ? activeMode - 1 : 0` ternary is gone and `activeMode - 1` is always `>= 0`; the falsy branch only renders when `activeMode === 0` (since `zChain.length === activeMode`).

2.3. Scope check: leave the `ariaLabel` (167–171) as is — for mode 0 it already reads "0 Z factors on the lower modes" (numerically accurate), and the audit scope is the visible paragraph. No other copy references the Z-string range.

**3. Bug (3): make `diracString` sign-aware — `web/src/components/quantum/state-readout.ts`.**

3.1. The current `diracString` (lines 22–28) joins terms with the literal `"  +  "` while `formatAmplitude` (13–20) emits a leading `-` for negative real (`:17`) or negative imaginary (`:18`), producing `... + -0.71|1⟩`.

3.2. Replace `diracString` (22–28) with a sign-aware assembly that keeps the existing visibility filter and `"0"` fallback unchanged:
```ts
export function diracString(state: Complex[], n: number): string {
  const shown = state
    .map((amp, idx) => ({ amp, idx }))
    .filter(({ amp }) => Math.abs(amp[0]) >= DISPLAY_EPS || Math.abs(amp[1]) >= DISPLAY_EPS);
  if (shown.length === 0) return "0";
  let out = "";
  shown.forEach(({ amp, idx }, i) => {
    const formatted = formatAmplitude(amp);
    const negative = formatted.startsWith("-");
    const magnitude = negative ? formatted.slice(1) : formatted;
    const term = `${magnitude}|${basisLabel(idx, n)}⟩`;
    if (i === 0) out = negative ? `-${term}` : term;
    else out += `${negative ? " - " : " + "}${term}`;
  });
  return out;
}
```
Behavior/edge cases:
- Separator is single-space-padded `" + "` / `" - "` (per spec), down from the previous `"  +  "`.
- `negative` is true only for bare real-only (`"-0.71"`) or bare imaginary-only (`"-0.71i"`) outputs; the compound form starts with `"("` so it is always treated as positive and rendered paren-wrapped (`... + (-0.50+0.50i)|...⟩`), never starting with a bare `-`. This is exactly the spec's "paren-wrapped so it never starts with a bare '-'."
- First term keeps a bare leading minus if negative.
- No `"-0.00"`/`"0.00"` degenerate term can reach assembly: the filter requires `|re| ≥ DISPLAY_EPS` or `|im| ≥ DISPLAY_EPS`, and `formatAmplitude` snaps any component `< DISPLAY_EPS` to exact 0, so a shown real/imag magnitude is `≥ 0.005` → formats to at least `"0.01"`.

3.3. Do NOT change `formatAmplitude` (13–20), `toPythonState` (33–45), the `StateReadout` primitive (`widget-ui.tsx:82-98`), or any call site (`widget-ui.tsx:87,90`; `encoding-explorer.tsx:98`). The signature `diracString(state: Complex[], n: number): string` is unchanged.

**4. Tests.**

4.1. Extend `web/__tests__/components/quantum/state-readout.test.ts` (existing) with a `describe("diracString sign-aware", ...)` block (or new `it`s inside the existing `describe`):
- `[[0.7071, 0], [-0.7071, 0]]` -> `expect(diracString(state, 1)).toBe("0.71|0⟩ - 0.71|1⟩")` (the core bug-3 regression).
- `[[-0.7071, 0], [0.7071, 0]]` -> `"-0.71|0⟩ + 0.71|1⟩"` (first term keeps bare minus).
- `[[0.7071, 0], [0, -0.7071]]` -> `"0.71|0⟩ - 0.71i|1⟩"` (negative imaginary uses `" - "`).
- `[[0.7071, 0], [-0.5, 0.5]]` -> assert `.toContain(" + (-0.50+0.50i)|")` and `.not.toContain("+ -")` and `.not.toContain("+  -")` (compound stays paren-wrapped, positive separator).
- A general guard on a signed superposition: `expect(s).not.toMatch(/\+\s+-/)`.
- Keep all existing assertions; verify they still pass with the new single-space separator (single-term `toBe("1.00|0⟩")`/`"1.00|1⟩"` are unaffected; Bell uses `toContain("|00⟩")` only).

4.2. Extend `web/__tests__/components/quantum/jw-explorer.test.tsx` (existing) — switch the render helpers to capture `container` (`const { container } = render(...)`):
- Default `source=""` (mode 0): `expect(container).not.toHaveTextContent(/q0 through q0/)` and `expect(container).toHaveTextContent(/no trailing Z-string/i)`.
- `source={JSON.stringify({ modes: 4, electrons: 2, mode: 2, dagger: true })}`: `expect(container).toHaveTextContent(/q0 through q1/)` (mode-2 selection initialized from config; `activeMode - 1 = 1`).
- Keep the three existing header/error tests as is.

4.3. Extend `web/__tests__/components/quantum/vqe-explorer.test.tsx` (existing) with an orientation regression test (`mockMatchMedia(false)` default state, energy above floor):
- `const { container } = render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />);`
- Scope to the landscape SVG (the BlochDial is a separate SVG): `const svg = container.querySelector('svg[aria-label^="Variational energy"]') as SVGSVGElement;`
- `const marker = svg.querySelector("circle")!;` (the only `<circle>` in this SVG, lines 309–316) and `const floor = svg.querySelector('line[stroke-dasharray="3 3"]')!;` (the floor line, 252–262).
- `const markerCy = Number(marker.getAttribute("cy"));` and `const floorY = Number(floor.getAttribute("y1"));`
- `expect(markerCy).toBeLessThan(floorY);` — at the default `theta = 0.4` the marker's energy is ABOVE the floor, so with the corrected map the marker sits at a SMALLER y (higher up) than the floor line. This assertion FAILS on the pre-fix (upside-down) code and PASSES after, locking in the orientation.

4.4. `pes-explorer.test.tsx` needs no change (PES is the correct reference; not modified). Note it does not assert the diracString separator.

#### File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | `web/src/components/quantum/vqe-explorer.tsx` | Flip `energyToY` (lines 139–140) to `SVG.padY + ((eMax - e)/span)*plotH` so lower energy maps lower; update the orientation comment at line 134. Floor/marker/drop-line/ticks derive from `energyToY` (no other edits); confirm floor label (`floorY - 4`) sits correctly near the bottom. |
| Modify | `web/src/components/quantum/jw-explorer.tsx` | Branch the plain-English paragraph (lines 342–349) on `image.zChain.length > 0`: mode>0 renders "(q0 through q{activeMode-1})"; mode 0 renders a "no trailing Z-string" sentence (reusing `sign`). Shared closing sentence stays outside the branch. Removes the phantom "q0 through q0". |
| Modify | `web/src/components/quantum/state-readout.ts` | Rewrite `diracString` (lines 22–28) to be sign-aware: per-term magnitude via `formatAmplitude`, `" + "`/`" - "` separators, first term keeps a bare leading minus, compound `(r±im i)` treated as positive (paren-wrapped). Filter and `"0"` fallback unchanged; `formatAmplitude`/`toPythonState`/signature unchanged. |
| Modify | `web/__tests__/components/quantum/state-readout.test.ts` | Add sign-aware `diracString` cases: signed real sum, leading-negative first term, negative-imaginary term, compound paren-wrapped term, and a `/\+\s+-/` negative guard. |
| Modify | `web/__tests__/components/quantum/jw-explorer.test.tsx` | Capture `container`; assert default (mode 0) has no "q0 through q0" and shows "no trailing Z-string"; assert mode 2 shows "q0 through q1". |
| Modify | `web/__tests__/components/quantum/vqe-explorer.test.tsx` | Add orientation test: in the landscape SVG, the marker `circle` `cy` is `<` the dashed floor `line` `y1` for the default above-floor state. |

No files created or deleted. (`pes-explorer.tsx` is read-only reference only.)

#### Testing & Validation

- Verify command (from repo root): `cd web && npm run lint && npm test && npm run build`. Expect lint clean, the existing ~479 Jest tests plus the new assertions green, and static export of 12 pages.
- Targeted iteration while developing: `cd web && npx jest state-readout jw-explorer vqe-explorer`.
- What the new tests assert (summary): `state-readout.test.ts` — signed sums render with `" - "`/`" + "` and no `"+ -"`, first-term bare minus preserved, compound stays paren-wrapped; `jw-explorer.test.tsx` — no phantom "q0 through q0" at mode 0, correct "q0 through q1" at mode 2; `vqe-explorer.test.tsx` — marker `cy < floorY` (correct orientation).
- Manual browser verification: `cd web && npm run dev`, open `http://localhost:3000/learn/05-quantum-chemistry`.
  - VQE (`qvqe`): the variational floor (green dashed line) should be near the BOTTOM, the curve a valley dipping toward it. Drag θ — energy readout falls as the marker moves DOWN toward the floor. Click "Optimize" — the marker visibly slides DOWN to the floor (toggle OS reduced-motion to confirm the jump path too). Confirm the green "floor … Ha" label sits just above the floor line, unclipped, not colliding with the −π/0/π tick labels.
  - JW (`qjw`): default view (mode 0) — the closing paragraph reads "Mode 0 has no lower-index orbitals, so there is no trailing Z-string…"; there is NO "q0 through q0". Select mode 2 — it reads "(q0 through q1)" and the inline `Z-string on q0…q1` span appears. All factor cells: q0 = X/Y, no Z to its left at mode 0.
  - Dirac output (`diracString`): on any circuit-family widget producing a signed superposition (e.g. a CircuitLab `H` then `Z`, or the encoding explorer with a negative amplitude) confirm `|ψ⟩` reads `0.71|0⟩ - 0.71|1⟩` (no `+ -`).
- Rollback: this lands as ONE squash-merged PR; `git revert <merge-sha>` cleanly restores all six files (pure source/test edits, no migrations, no config/deps, no generated artifacts), after which `npm run build` reproduces the prior output.

#### Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| VQE floor label clipped or overlapping ticks once near the bottom | Low | Med | Math bounds it to `y ≈ 152` (inside `viewBox` 0–170, above the line, clear of x-tick labels at y=167); explicit manual check in step 1.5; the new `markerCy < floorY` test catches gross geometry inversion. |
| Visual regression from separator change `"  +  "` → `" + "` in `StateReadout`/`encoding-explorer` | Med | Low | Intentional and spec-mandated; tightens to a single space, reads cleaner; no test asserts the old double space (`wavefunction-scrubber`/`bloch-builder-widget` tests match single terms via regex, e.g. `/0\.71\|0⟩/`); confirmed via grep that `"  +  "` lives only in `state-readout.ts`. |
| a11y regression (SVG `aria-label`, JW group copy) | Low | Low | VQE `curveAria` (204–210) is numeric and orientation-agnostic — unaffected by the y-flip. JW `ariaLabel` already reads "0 Z factors" at mode 0 (accurate). No roles/labels removed. |
| Existing test breakage from new `diracString` output | Low | Med | Audited all assertions: single-term `toBe` and `toContain("|xx⟩")` cases are separator-agnostic and still pass; no snapshot tests touch this output. Run the full suite in verify. |
| Token/cascade pitfall | Low | Low | No Tailwind/`@theme inline` token, class, or `globals.css` change — edits are pure TS/JSX logic and copy; `dark:` utilities and SVG `currentColor`/token classes untouched. |
| Lint `no-unused-vars` after the y-flip (`eMin`/`eMax`) | Low | Low | `eMin` stays referenced by `span`; `eMax` now referenced by `energyToY`; both remain used. `npm run lint` in verify confirms. |

#### Dependencies & Order of Operations
- The three bugs are independent (different files, no shared symbols) and can be implemented and tested in any order, or in parallel. Suggested internal sequence: Bug (3) `state-readout.ts` first (smallest blast radius, broadest consumer reach, fast unit feedback), then Bug (2) `jw-explorer.tsx`, then Bug (1) `vqe-explorer.tsx`. Write/extend each test file alongside its source change.
- This is a pure-fix package with no new shared primitive, so it has NO ordering dependency on any primitives-first WS-6x package — it can land before or after the others. It touches only `vqe-explorer.tsx`, `jw-explorer.tsx`, `state-readout.ts`, and their tests; any sibling WS-6x package editing different widgets will not conflict (the only shared file, `state-readout.ts`, is exclusive to this package). Run the full `lint && test && build` once after all three are integrated, then squash-merge.

#### Estimated Effort
- Complexity: Low (localized logic/copy fixes; no new APIs, deps, tokens, or 3D/WebGL paths).
- Time: 1.5–2.5 hours including new test assertions and manual browser verification on `/learn/05-quantum-chemistry`.
- File count: 0 create / 6 modify (3 source: `vqe-explorer.tsx`, `jw-explorer.tsx`, `state-readout.ts`; 3 tests: `state-readout.test.ts`, `jw-explorer.test.tsx`, `vqe-explorer.test.tsx`) / 0 delete.


---

### WS-6b — LiveStatus a11y sweep (announce computed results to screen readers)

#### Objective
Today, changing a `<select>`, pressing Run/Optimize, or toggling a control in 11 of the circuit-family explorables silently recomputes the on-screen teaching result, but a screen reader hears only the control label — never the new verdict, probability, energy, or coefficient. This package extracts one shared `LiveStatus` primitive into `widget-ui.tsx` (mirroring the three already-correct widgets at `correlation-demo.tsx:134`, `metrics-explorer.tsx:359`, `job-explorer.tsx:469`) and wires a concise polite live region into each of the 11 select-/Run-/Optimize-driven widgets, plus enriches the Grover and Encoding slider `aria-valuetext` to embed the computed result rather than the raw input. When done, every interactive recompute in these widgets is announced once, politely, with no visual change.

#### Prerequisites
- Tooling already in the repo: Node/npm, Jest + `@testing-library/react` + `@testing-library/jest-dom`, ESLint, Next 16 static export. No new packages.
- Knowledge: how `role="status" aria-live="polite"` regions work — the node must stay mounted and only its *text* changes (this is why the existing references render a persistent `<p>` whose `{children}` is a possibly-empty string), and "polite" queues rather than interrupts (avoids drag-spam). Initial mount text is generally NOT announced; only subsequent changes are.
- Branch off fresh `main` (`git switch -c ws-6b-livestatus`). Implement on the branch, verify with `cd web && npm run lint && npm test && npm run build`, then squash-PR.
- Coordination note: WS-6a also edits `vqe-explorer.tsx` and `jw-explorer.tsx`. If WS-6a is in flight, rebase to avoid conflicts in those two files (see Dependencies).

#### Step-by-Step Implementation

**1. Add the shared `LiveStatus` primitive to `widget-ui.tsx`.**

1.1 At the top of `web/src/components/quantum/widget-ui.tsx` (currently no React import; lines 1–4 import only from `./math`, `./qsim-dsl`, `./state-readout`, `../copy-button`), add a type-only import:
```ts
import { type ReactNode } from "react";
```

1.2 Append a new exported component after `ErrorCard` (after line 123). Exact signature and body, mirroring the three reference call-sites verbatim:
```tsx
/**
 * Polite screen-reader live region for announcing a recomputed teaching result
 * (a verdict, probability, energy, coefficient, ...) when a select / Run /
 * Optimize / toggle changes it. Visually hidden (sr-only); the node stays
 * mounted so aria-live fires on text change. Keep the announcement to one
 * concise line and pass an empty string when there is nothing to announce
 * (e.g. before the first Run). Polite, never assertive, to avoid drag-spam.
 * Mirrors correlation-demo.tsx / metrics-explorer.tsx / job-explorer.tsx.
 */
export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {children}
    </p>
  );
}
```
Keep it children-only (no `className`/`assertive` props) — every WS-6b consumer wants the same sr-only polite region, and the existing visible status in `job-explorer.tsx:469` is intentionally NOT sr-only so it stays out of scope.

**2. Placement convention (applies to all 11).** Insert `<LiveStatus>…</LiveStatus>` as the FIRST child immediately inside each widget's success-path outer card `<div className="not-prose …">`, exactly as `correlation-demo.tsx:134` does. `sr-only` is `position:absolute`/clipped, so it never affects the flex/block layout or the `overflow-hidden` cards. Add it ONLY in the main success return, never in the early `ErrorCard` return. Add `LiveStatus` to the existing `./widget-ui` import where one exists; add a new `import { LiveStatus } from "./widget-ui";` where one does not (see File & Code Changes for which is which).

**3. `shots-sampler.tsx`** (success return opens line 52; `probs` line 20–23; `handleRun` line 29–33; `program.n`). New import from `./widget-ui`. Compute the empirical most-probable index in render scope (no new state):
```ts
const empiricalArgmax =
  counts ? counts.reduce((best, c, i, arr) => (c > arr[best] ? i : best), 0) : 0;
```
Insert as first child of the success card:
```tsx
<LiveStatus>
  {total > 0 && counts
    ? `Sampled ${total} shots. Most-probable |${basisLabel(empiricalArgmax, program.n)}\u27E9: empirical ${(
        (counts[empiricalArgmax] / total) * 100
      ).toFixed(1)}%, exact ${(probs[empiricalArgmax] * 100).toFixed(1)}%.`
    : ""}
</LiveStatus>
```
Edge cases: before first Run `total===0` → empty string (no announcement); `counts` and `probs` are both length `2^n` so indices align; ties resolve to the lowest index (reduce keeps `best` on `c > arr[best]`).

**4. `device-table.tsx`** (root card div line 33; `sorted` line 24; `tech` line 12). New import from `./widget-ui` (currently imports only `./devices`, `./cost`). First child of root:
```tsx
<LiveStatus>
  {`${sorted.length} device${sorted.length === 1 ? "" : "s"} shown${
    tech === "All" ? "" : `, ${tech}`
  }.`}
</LiveStatus>
```
Announces on technology-filter change (count + filter name). Sort-direction changes reorder rows without changing the string, so they do not spam.

**5. `dj-demo.tsx`** (success return line 72; `verdict` line 69; `result.probs`, `result.n`). Add `LiveStatus` to the existing `./widget-ui` import. First child of the success card:
```tsx
<LiveStatus>
  {`Verdict: ${verdict}. All-zeros probability ${(result.probs[0] * 100).toFixed(1)}%.`}
</LiveStatus>
```
The all-zeros probability is the decisive Deutsch–Jozsa quantity (1 for Constant, 0 for Balanced). Announces on oracle-select change.

**6. `grover-visualizer.tsx`** (success return line 91; `success` line 81; `frame` line 78; slider `aria-valuetext` line 163). Add `LiveStatus` to the existing `./widget-ui` import.
- 6.1 First child of the success card:
```tsx
<LiveStatus>
  {`Success probability ${(success * 100).toFixed(1)}% at ${frame} iteration${
    frame === 1 ? "" : "s"
  }.`}
</LiveStatus>
```
Catches the qubits/marked `<select>` changes (which the slider's own value text does not).
- 6.2 Enrich the iterations slider `aria-valuetext` (line 163) from the raw `${frame} iterations` to embed the computed result, as vqe/pes already do:
```tsx
aria-valuetext={`${frame} iteration${frame === 1 ? "" : "s"}, success ${(success * 100).toFixed(1)}%`}
```
Note: on slider drag both the slider value text and the LiveStatus update; both are polite so they queue rather than collide.

**7. `qft-visualizer.tsx`** (success return line 160; `note` line 152–155). Add `LiveStatus` to the existing `./widget-ui` import. First child of the success card:
```tsx
<LiveStatus>{note}</LiveStatus>
```
Honesty caveat (call it out in the PR body): `QftVisualizer` has NO interactive control — it is fully derived from the `source` prop — so this region only re-announces if the fenced source itself changes. It is added for sibling consistency and to be the natural home if a control is later added; the visible `note` paragraph (line 186) remains the primary static readout. This is a deliberate, low-value-but-harmless inclusion to honor the "all 11" scope.

**8. `encoding-explorer.tsx`** (return line 100; `norm` line 93–96; `dirac` line 98; `encoding`; x0 valuetext line 171; x1 valuetext line 193). New import from `./widget-ui` (currently imports `./math`, `./state-readout`, `./bloch-dial`, `./encoding`).
- 8.1 First child of the card:
```tsx
<LiveStatus>
  {`${ENCODING_LABEL[encoding]} feature map. \u2016\u03C8\u2016 = ${norm.toFixed(
    3
  )}. |\u03C8\u27E9 = ${dirac}.`}
</LiveStatus>
```
Covers the WP's "amplitude/Dirac/norm": norm + the Dirac string (which encodes the amplitudes). Announces on encoding-select change and slider drag. (`dirac` on every drag tick is verbose but polite; acceptable, and the sliders below also self-announce per 8.2.)
- 8.2 Enrich both slider `aria-valuetext`s to embed the computed norm instead of the raw value:
  - x0 (line 171): `aria-valuetext={`x0 = ${x0.toFixed(2)}, norm ${norm.toFixed(3)}`}`
  - x1 (line 193): `aria-valuetext={`x1 = ${x1.toFixed(2)}, norm ${norm.toFixed(3)}`}`

  `norm` is computed in the component body before the return (line 93), so it is in scope for the attributes. Use ASCII in attribute strings (no HTML entities).

**9. `vqe-explorer.tsx`** (return line 212; `energy` line 127; `aboveFloor` line 128; `floor`; `optimizing` state line 96). Add `LiveStatus` to the existing `./widget-ui` import. First child of the card, gated on `optimizing` so the ~40-frame Optimize animation does NOT fire ~40 announcements (mirror metrics-explorer's start/finish-only approach):
```tsx
<LiveStatus>
  {optimizing
    ? "Optimizing toward the variational floor."
    : `Energy ${energy.toFixed(4)} hartree, ${aboveFloor.toFixed(
        4
      )} above the exact ground floor ${floor.toFixed(4)} hartree.`}
</LiveStatus>
```
Announces "Optimizing…" once at click, then the settled energy+gap once at the end and on Reset. Manual slider drags set `optimizing=false` and update the text (the slider also self-announces via its existing enriched `aria-valuetext` at line 368). WS-6a overlap: see Dependencies.

**10. `jw-explorer.tsx`** (return line 173; `image` from `jwTransform` line 139; `activeMode` line 136; `dagger` line 124; `opName` line 165). Add `LiveStatus` to the existing `./widget-ui` import. First child of the card content:
```tsx
<LiveStatus>
  {`${dagger ? "Creation" : "Annihilation"} operator ${opName}: X-string ${
    image.xString
  }, ${image.zChain.length} Z parity factor${image.zChain.length === 1 ? "" : "s"}.`}
</LiveStatus>
```
Announces on operator-mode button selection and the creation/annihilation toggle. WS-6a overlap: see Dependencies.

**11. `hamiltonian-explorer.tsx`** (return line 226; `shownTerms` line 214; `signed()` line 116; `tapered` line 185; `R` line 184). Add `LiveStatus` to the existing `./widget-ui` import. First child of the card:
```tsx
<LiveStatus>
  {`${tapered ? "Tapered 1-qubit" : "4-qubit"} H2 at R = ${R.toFixed(
    2
  )} angstrom. Largest term ${shownTerms[0].label} = ${signed(
    shownTerms[0].coeff,
    BAR_PRECISION
  )} hartree.`}
</LiveStatus>
```
Announces coefficients on R-slider drag and on the tapered toggle. Keep the existing hidden `<svg role="img" aria-label={listLabel}>` (lines 292–300) as the static image label for the bar chart — it is read when navigating to the chart, whereas the new region is what announces on change (the svg's `aria-label` change is not announced by SRs). Slight content overlap is acceptable; do not delete the svg in this PR.

**12. `checkpoint-explorer.tsx`** (return line 237; `metrics` destructured line 234 → `wastedNo`, `wastedWith`, `saving`; `clampedFail` line 219; `clampedEvery` line 220). Add `LiveStatus` to the existing `./widget-ui` import. First child of the card:
```tsx
<LiveStatus>
  {`Failure at iteration ${clampedFail}, checkpoint every ${clampedEvery}: ${saving.toFixed(
    0
  )} iterations saved (${wastedNo.toFixed(0)} redone without, ${wastedWith.toFixed(
    0
  )} with).`}
</LiveStatus>
```
Announces on both the "fail at" and "checkpoint every" sliders.

**13. `param-compile-explorer.tsx`** (return line 242; `saved`, `percent`, `n` from `metrics` line 239; `formatSec` line 88). Add `LiveStatus` to the existing `./widget-ui` import. First child of the card:
```tsx
<LiveStatus>
  {`Compile once and reuse saves ${formatSec(saved)} (${percent.toFixed(
    1
  )}% less wall-clock) over ${n} iterations.`}
</LiveStatus>
```
Announces on the iterations / compile-sec / run-sec sliders.

**14. Do NOT refactor the three reference widgets.** `correlation-demo.tsx` and `metrics-explorer.tsx` could mechanically swap to `LiveStatus`, and `job-explorer.tsx:469` cannot (it is a *visible* status, not sr-only). To keep the diff minimal and avoid disturbing `correlation-demo.test.tsx`'s `getByRole("status")` assertion, leave all three untouched (optional future DRY follow-up).

#### File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | web/src/components/quantum/widget-ui.tsx | Add `import { type ReactNode } from "react"`; export new `LiveStatus({ children })` sr-only polite region after `ErrorCard`. |
| Modify | web/src/components/quantum/shots-sampler.tsx | New `./widget-ui` import; compute `empiricalArgmax`; add `LiveStatus` (shots + most-probable basis empirical vs exact) in success return. |
| Modify | web/src/components/quantum/device-table.tsx | New `./widget-ui` import; add `LiveStatus` (filtered device count + technology) as first child of card. |
| Modify | web/src/components/quantum/dj-demo.tsx | Add `LiveStatus` to existing import; announce verdict + all-zeros probability. |
| Modify | web/src/components/quantum/grover-visualizer.tsx | Add `LiveStatus` to import; announce success P; enrich iterations slider `aria-valuetext` with success %. |
| Modify | web/src/components/quantum/qft-visualizer.tsx | Add `LiveStatus` to import; announce the spectrum `note` (consistency; no runtime control — documented caveat). |
| Modify | web/src/components/quantum/encoding-explorer.tsx | New `./widget-ui` import; add `LiveStatus` (encoding + norm + Dirac); enrich x0/x1 slider `aria-valuetext` with norm. |
| Modify | web/src/components/quantum/vqe-explorer.tsx | Add `LiveStatus` to import; announce energy + gap, gated on `optimizing` to avoid per-frame spam. |
| Modify | web/src/components/quantum/jw-explorer.tsx | Add `LiveStatus` to import; announce operator + X-string + Z-parity count on mode/dagger change. |
| Modify | web/src/components/quantum/hamiltonian-explorer.tsx | Add `LiveStatus` to import; announce tapered/full + R + largest-term coefficient; keep hidden svg label. |
| Modify | web/src/components/quantum/checkpoint-explorer.tsx | Add `LiveStatus` to import; announce iterations saved (with/without) on slider change. |
| Modify | web/src/components/quantum/param-compile-explorer.tsx | Add `LiveStatus` to import; announce wall-clock saved + percent on slider change. |
| Create | web/__tests__/components/quantum/widget-ui.test.tsx | Unit-render `LiveStatus`: role="status", aria-live="polite", sr-only class, renders children. |
| Modify | web/__tests__/components/quantum/shots-sampler.test.tsx | Assert status announces shots + most-probable basis after Run. |
| Modify | web/__tests__/components/quantum/device-table.test.tsx | Assert status reflects filtered count/technology after filter change. |
| Modify | web/__tests__/components/quantum/dj-demo.test.tsx | Assert status reads Balanced/Constant after oracle change. |
| Modify | web/__tests__/components/quantum/grover-visualizer.test.tsx | Assert status has "success probability"; slider `aria-valuetext` embeds success %. |
| Modify | web/__tests__/components/quantum/qft-visualizer.test.tsx | Assert a status node renders carrying the spectrum note. |
| Modify | web/__tests__/components/quantum/encoding-explorer.test.tsx | Assert status carries norm; slider `aria-valuetext` embeds norm. |
| Modify | web/__tests__/components/quantum/vqe-explorer.test.tsx | Assert status carries energy after Optimize (reduced-motion mock). |
| Modify | web/__tests__/components/quantum/jw-explorer.test.tsx | Assert status reads annihilation after toggling the operator. |
| Modify | web/__tests__/components/quantum/hamiltonian-explorer.test.tsx | Assert status carries "R =" and a largest-term coefficient. |
| Modify | web/__tests__/components/quantum/checkpoint-explorer.test.tsx | Assert status carries "iterations saved". |
| Modify | web/__tests__/components/quantum/param-compile-explorer.test.tsx | Assert status carries the percent-saved figure. |

#### Testing & Validation

Unit/render tests (colocated jsdom; preserve every existing `matchMedia` shim where present — vqe, jw, hamiltonian, checkpoint, param-compile need it):
- `widget-ui.test.tsx` (new): `render(<LiveStatus>hello</LiveStatus>)` → `getByRole("status")` `toHaveTextContent("hello")`, `toHaveClass("sr-only")`, `toHaveAttribute("aria-live", "polite")`.
- `shots-sampler.test.tsx`: extend the "running shots updates the total" test — after clicking "1000 shots" then "Run", `getByRole("status")` `toHaveTextContent(/sampled 1000 shots/i)` and `/empirical/i`.
- `device-table.test.tsx`: after `fireEvent.change(... "Trapped ion")`, `getByRole("status")` `toHaveTextContent(/trapped ion/i)`; assert a status node exists on initial render.
- `dj-demo.test.tsx`: after switching to `parity`, `getByRole("status")` `toHaveTextContent(/balanced/i)`.
- `grover-visualizer.test.tsx`: `getByRole("status")` `toHaveTextContent(/success probability/i)`; `getByRole("slider")` `aria-valuetext` matches `/success/i`.
- `qft-visualizer.test.tsx`: for `period:4`, `getByRole("status")` `toHaveTextContent(/spikes every/i)`.
- `encoding-explorer.test.tsx`: `getByRole("status")` `toHaveTextContent(/norm/i)`; an x slider's `aria-valuetext` matches `/norm/i`.
- `vqe-explorer.test.tsx`: with `mockMatchMedia(true)`, after Optimize, `getByRole("status")` `toHaveTextContent(/hartree/i)`.
- `jw-explorer.test.tsx`: after clicking the "annihilation" button, `getByRole("status")` `toHaveTextContent(/annihilation/i)`.
- `hamiltonian-explorer.test.tsx`: `getByRole("status")` `toHaveTextContent(/R = /)` and `/hartree/i`.
- `checkpoint-explorer.test.tsx`: `getByRole("status")` `toHaveTextContent(/iterations saved/i)`.
- `param-compile-explorer.test.tsx`: `getByRole("status")` `toHaveTextContent(/%/)`.

Disambiguation: none of these 11 widgets currently render a `role="status"` node (verified by grep), so each gets exactly one — `getByRole("status")` stays unambiguous in tests. (`metrics-explorer`, `job-explorer`, `correlation-demo` already have their own and are untouched.)

Verify commands (from repo root):
```
cd web && npm run lint && npm test && npm run build
```
Expect lint clean, ~479+12 Jest tests green (was ~479; +1 new file, +11 extended), and a 12-page static export with no new warnings.

Manual browser verification (`npm run build` then serve, or `npm run dev`): open lessons containing each fence. With VoiceOver (macOS) or NVDA on:
1. Devices table → change the Technology select → hear "N devices shown, <tech>" (no other UI change).
2. Deutsch–Jozsa → change Oracle → hear "Verdict: Balanced. All-zeros probability 0.0%".
3. Shots sampler → press Run → hear "Sampled 1000 shots. Most-probable |…⟩ empirical …%, exact …%".
4. Grover → focus the iterations slider, arrow-key → hear "<k> iterations, success …%"; change qubits/marked select → hear the success line.
5. VQE → press Optimize → hear "Optimizing…" then a single settled "Energy … hartree …" (NOT ~40 announcements).
6. Encoding → change Map select → hear "<encoding> feature map. ‖ψ‖ = 1.000 …"; arrow the x0 slider → value text includes norm.
7. JW → toggle creation/annihilation → hear the operator/Pauli line.
8. Hamiltonian → drag R / toggle tapering → hear the coefficient line.
9. Checkpoint / Param-compile → drag sliders → hear the saved-iterations / saved-seconds line.
Visually confirm NO layout shift anywhere (sr-only is clipped). Toggle dark mode to confirm unchanged.

Rollback: the entire change is one squash-merged PR with no migrations, env, or data changes. `git revert <merge-sha>` (or revert the PR from the GitHub UI) cleanly removes `LiveStatus`, the 11 widget call-sites, the two enriched `aria-valuetext`s, and the test edits; re-run the verify command to confirm green.

#### Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Visual regression (layout shift from injected node) | Low | Med | `LiveStatus` is `sr-only` (absolute/clipped, 1px) — out of flow; proven by `correlation-demo.tsx:134` inside an identical `overflow-hidden` card. Manual visual check + dark-mode check. |
| a11y regression: drag-spam from per-tick announcements | Med | Med | All regions are `aria-live="polite"` (queues); VQE's Optimize animation is gated on `optimizing` (one announce at start/finish, like `metrics-explorer`); slider-driven widgets were already in-scope of WS-3's polite pattern. |
| a11y regression: duplicate/competing status nodes | Low | Med | Grep confirms these 11 have zero existing `role="status"`; each gains exactly one. References with existing regions are untouched. |
| Test breakage from ambiguous `getByRole("status")` | Low | Low | Exactly one status node per widget; tests assert on it directly. Existing `correlation-demo.test.tsx` reference untouched. |
| `ReactNode` import / JSX-runtime mismatch in `widget-ui.tsx` | Low | Low | Type-only `import { type ReactNode }`; JSX uses Next's automatic runtime (no `React` value import needed), matching sibling components. `npm run build` (tsc) catches any issue. |
| Token/cascade pitfall (sr-only under `@theme inline`) | Low | Low | `sr-only` is a standard Tailwind v4 utility already used across the repo (sr-only headings in metrics/jw); no `@theme inline` token is touched, no runtime-overridable token involved. |
| Verbose Dirac/coefficient strings annoying SR users | Low | Low | Strings are single-sentence; polite; the most verbose (encoding Dirac) is the existing visible readout's content, and sliders self-announce via enriched `aria-valuetext`. |

#### Dependencies & Order of Operations
- Step 1 (the `LiveStatus` primitive) MUST land before Steps 3–13 (the consumers) — but all live in ONE PR, so it is an internal ordering, not a cross-PR dependency. Implement Step 1 first, then the widgets, then tests.
- Steps 3–13 are mutually independent (one file each) and can be done in any order / parallelized. Step 14 is a no-op-by-decision.
- Tests (Create/Modify rows) depend on their corresponding widget edits; write each test right after its widget.
- Cross-WS: this package overlaps WS-6a on `vqe-explorer.tsx` and `jw-explorer.tsx` only. There is no logical dependency (different concerns), but to avoid textual merge conflicts, land WS-6b after WS-6a, or rebase WS-6b on top of WS-6a before opening the PR. No "primitives before migrations" cross-PR concern exists because `LiveStatus` is self-contained in this PR.
- Suggested internal sequence: (1) primitive + `widget-ui.test.tsx`; (2) the four trivial select/Run widgets (device-table, dj-demo, shots-sampler, qft) + tests; (3) grover + encoding (LiveStatus + `aria-valuetext` enrich) + tests; (4) vqe + jw (coordinate with WS-6a) + tests; (5) hamiltonian, checkpoint, param-compile + tests; (6) run the full verify command.

#### Estimated Effort
- Complexity: Low–Med (mechanical, repetitive; the only judgment calls are VQE's `optimizing` gate, shots' argmax, and the qft no-control caveat).
- Time: ~2–3 hours including tests and manual SR verification.
- File count: 1 created (`widget-ui.test.tsx`), 23 modified (12 source: `widget-ui.tsx` + 11 widgets; 11 test files), 0 deleted.


---

### WS-6c — Shared shell + slider primitives (WidgetCard / EyebrowLabel / Chip / LabeledSlider)

#### Objective
Eliminate the two largest remaining copy-paste surfaces in the explorables: the hand-written card chrome (outer `rounded-card` shell + `border-b … px-4 py-2` header + `text-accent` eyebrow + gray `rounded-chip` pills), repeated across ~28 widgets and drifting (`flex` vs `flex flex-wrap` vs `justify-between`; `noise-visualizer` builds the shell three times), and the `label + <input type="range" class="slider flex-1 focus-ring"> + tabular-nums value` row, repeated across 15 widgets / 22 inputs. When done, those are single-sourced as `WidgetCard` + `EyebrowLabel` + `Chip` and `LabeledSlider` in `widget-ui.tsx`, `ErrorCard` reuses the same shell, every migrated widget renders visually identically (byte-identical where the current chrome already matches the dominant pattern), and the WCAG 2.5.8 24px thumb + `.focus-ring` + exact `aria-label`/`aria-valuetext` strings are preserved so the ~479 Jest tests stay green.

#### Prerequisites
- Toolchain already present: `cd web && npm ci` done; Node/npm working; `npm run lint`, `npm test`, `npm run build` all currently green (~479 jest tests, 12-page static export).
- Knowledge of the existing primitives in `web/src/components/quantum/widget-ui.tsx` (`gateLabel`, `GateChip`, `GateChips`, `ProbBars`, `StateReadout`, `ErrorCard`) and the `parse-utils`/`use-display-caps` helpers.
- Confirmed facts this plan is grounded in:
  - **Exact shell string** (identical from `rounded-card` through `shadow-(--shadow-resting)` in every widget and in `ErrorCard`): `rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting)`. Widgets append `overflow-hidden`; `ErrorCard` appends `px-4 py-3`. Margin is `my-6` (most) or `className`.
  - **Exact eyebrow string** (identical in all 28 widgets, `grep` confirmed): `text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light`. Usually a `<span>`; `checkpoint-explorer.tsx:241` uses `<h3 id={headingId}>` with the same class.
  - **Exact static chip string** (e.g. `grover-visualizer.tsx:96`): `rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300` (no `transition-colors`; this is distinct from the existing `GateChip`).
  - **Header-row drift** (`grep` tally): dominant `flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2` (12×); `flex items-center gap-2 …` (11×, no `flex-wrap`); several `justify-between …` variants with right-aligned status and some with `px-4 sm:px-5 py-3` / `py-2.5` (noise, metrics, cost-calculator, device-table, job-explorer, etc.).
  - **Slider tests assert exact strings**: `wavefunction-scrubber.test.tsx:38` requires `aria-valuetext` matching `/step \d+ of \d+/i` (this differs from the visible readout `step X/Y`); `bloch-builder-widget.test.tsx:26-27` and `noise-visualizer.test.tsx:22` use `getByLabelText` on the exact `aria-label`; `vqe-explorer.test.tsx:45` uses `getByRole("slider")`. These confirm `aria-label` and `aria-valuetext` must be preserved verbatim per slider.
  - **Slider variation reality** (from reading all 15): label glyph/text varies (θ φ γ β R x₀ x₁, "iterations", "depth", "scale", "fail at"); label width varies (`w-4 w-6 w-8 w-10 w-16 w-28 w-32` or none); label font is `font-mono text-sm` for most but `text-xs` (no mono) in `noise-visualizer` and the donor `SliderRow` uses `font-mono text-xs`; value width varies (`w-8 w-10 w-12 w-14 w-16 w-20`); value content is plain / number+unit (`rad`, `Å` via `&#8491;`, `%`, `s`) / number with a dimmed unit span (donor `SliderRow`); `parse` is `parseInt` or `parseFloat`; `aria-valuetext` is `format(value)`-like for most but **richer** in `pes-explorer.tsx:366` (FCI/HF/gap) and `vqe-explorer` (energy) and **decoupled from the readout** in `wavefunction-scrubber` (`step X of Y`); wrapper is either a full-bleed `border-t … px-4 py-3` row (bloch-builder, wavefunction-scrubber, circuit-lab, grover) or an in-body `mt-2/mt-3/mt-4 flex …` row; `job-explorer` uses a **stacked** layout (label above, input+value in a nested `flex`).

#### Step-by-Step Implementation

This package ships as **two PRs** (rationale in *Dependencies & Order of Operations*): **PR-A** = shell primitives + ErrorCard reuse + header migrations; **PR-B** = `LabeledSlider` + slider migrations. Within each PR, the primitive lands in commit 1, migrations follow in small green commits.

---

##### Part A — `WidgetCard` / `EyebrowLabel` / `Chip` (PR-A)

**1. Add the shell constant + primitives to `widget-ui.tsx`.**

1.1 At the top of `widget-ui.tsx`, add a React import (the file currently has no React import; it needs `ReactNode` typing). Add:
```ts
import type { ReactNode } from "react";
```

1.2 Export the single-sourced shell class string (the bytes shared by every widget and `ErrorCard`):
```ts
/** Outer card shell shared by every explorable and by ErrorCard. Margin,
 *  overflow, and any header/body live on the consumer, not here. */
export const cardShell =
  "rounded-card border border-gray-200/80 dark:border-gray-700/40 " +
  "bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] " +
  "shadow-(--shadow-resting)";
```
Edge case: keep it a flat string (no template interpolation) so Tailwind's content scanner sees every literal class.

1.3 Add `EyebrowLabel`. It hardcodes the verified-identical eyebrow class and supports the `<h3>` variant used by `checkpoint-explorer`:
```ts
/** The text-accent uppercase eyebrow used in every widget header. Renders a
 *  <span> by default; pass as="h3" + id for widgets that expose the eyebrow as
 *  the card's accessible heading (e.g. CheckpointExplorer). */
export function EyebrowLabel({
  children,
  as: Tag = "span",
  id,
}: {
  children: ReactNode;
  as?: "span" | "h3";
  id?: string;
}) {
  return (
    <Tag
      id={id}
      className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light"
    >
      {children}
    </Tag>
  );
}
```

1.4 Add `Chip` (the static gray pill — distinct from `GateChip`, which animates an active state):
```ts
/** Static metadata pill in a widget header (e.g. "N = 8", "50 iter"). */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
      {children}
    </span>
  );
}
```

1.5 Add `WidgetCard`. Default header is the **dominant** `flex flex-wrap items-center gap-2 … px-4 py-2` row; `header` is a full escape hatch for `justify-between`/padded variants; `headerRight` is a convenience slot for the common eyebrow-left/status-right case; when no eyebrow/header is supplied (the `ErrorCard` case) no header row and no `overflow-hidden` are emitted:
```ts
export function WidgetCard({
  eyebrow,
  eyebrowAs,
  eyebrowId,
  chips,
  headerRight,
  header,
  children,
  className = "my-6",
}: {
  eyebrow?: ReactNode;
  eyebrowAs?: "span" | "h3";
  eyebrowId?: string;
  chips?: ReactNode;          // pass <Chip>…</Chip> nodes (or a fragment of them)
  headerRight?: ReactNode;    // right-aligned status; switches header to justify-between
  header?: ReactNode;         // full custom header row, overrides eyebrow/chips/headerRight
  children: ReactNode;        // body; consumer owns its padding (px-4 py-4, border-t rows…)
  className?: string;         // outer margin + extras (default my-6)
}) {
  const hasHeader = header !== undefined || eyebrow !== undefined;
  let headerNode: ReactNode = header;
  if (headerNode === undefined && eyebrow !== undefined) {
    headerNode = headerRight !== undefined ? (
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <EyebrowLabel as={eyebrowAs} id={eyebrowId}>{eyebrow}</EyebrowLabel>
        {headerRight}
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <EyebrowLabel as={eyebrowAs} id={eyebrowId}>{eyebrow}</EyebrowLabel>
        {chips}
      </div>
    );
  }
  return (
    <div className={`not-prose ${className} ${cardShell}${hasHeader ? " overflow-hidden" : ""}`}>
      {headerNode}
      {children}
    </div>
  );
}
```
Edge cases handled: (a) `not-prose` and margin stay on the outer div exactly as today; (b) `overflow-hidden` only when a header exists (matches every current widget; `ErrorCard` never had it); (c) the `flex` vs `flex flex-wrap` drift is intentionally **normalized to `flex flex-wrap`** — this is the drift-fix the WP calls out, visually identical at normal widths and strictly better when chips overflow; (d) widgets whose header is `justify-between` with custom padding (`px-4 sm:px-5 py-3`, `py-2.5`) pass a full `header={…}` node so they stay byte-identical.

**2. Refactor `ErrorCard` to reuse the shell (`widget-ui.tsx:105-123`).** Replace the inline shell string with `cardShell`, keeping margin/padding placement byte-identical:
```ts
export function ErrorCard({ label, message, className = "my-6" }: {
  label: string; message?: string; className?: string;
}) {
  return (
    <div className={`not-prose ${className} ${cardShell} px-4 py-3`}>
      <p className="font-mono text-sm text-gray-500 dark:text-gray-400">
        {`${label} error: ${message ?? ""}`}
      </p>
    </div>
  );
}
```
This is byte-identical to today (`cardShell` expands to the exact substring it replaces). Do **not** route `ErrorCard` through `WidgetCard` (that would move `px-4 py-3` from the div onto an inner node — invisible but not byte-identical and pointless churn); reusing the shared `cardShell` string is the "reuse the same shell" requirement, at zero render risk.

**3. Migrate the standard-header explorables to `WidgetCard` (one widget per commit).** For each, replace the hand-written outer `<div className="not-prose my-6 rounded-card …">` + header `<div>` + eyebrow `<span>` + chip `<span>`s with `<WidgetCard eyebrow="…" chips={<><Chip>…</Chip>…</>}>…</WidgetCard>`, leaving the body untouched. Migrate in this order (clean, left-aligned eyebrow+chips, `px-4 py-2`):
- `circuit-lab.tsx`, `bloch-builder-widget.tsx` (chip currently `GateChip` inside `flex flex-wrap gap-1` — pass `chips={<div className="flex flex-wrap gap-1"><GateChip …/></div>}` to keep the gate-formula pill byte-identical), `wavefunction-scrubber.tsx` (chips = `<div className="flex flex-wrap gap-1"><GateChips …/></div>`), `grover-visualizer.tsx`, `param-compile-explorer.tsx`, `checkpoint-explorer.tsx` (`eyebrowAs="h3"`, `eyebrowId={headingId}`), `barren-explorer.tsx`, `kernel-explorer.tsx`, `hamiltonian-explorer.tsx`, `pes-explorer.tsx`, `qaoa-explorer.tsx`, `vqe-explorer.tsx`, `encoding-explorer.tsx`, `correlation-demo.tsx`, `dj-demo.tsx`, `jw-explorer.tsx`, `topology-explorer.tsx`, `qft-visualizer.tsx`, `vqc-trainer.tsx`.

Per-widget rule: keep each `Chip`'s inner content (and any `&#10217;`, `basisLabel(...)`, etc.) verbatim; only the wrapper `<span className="rounded-chip …">` collapses to `<Chip>`. Run `npm test` after each commit.

**4. Migrate the `justify-between` / right-status widgets.** Use `headerRight` (or full `header`) to preserve byte-identical chrome:
- `noise-visualizer.tsx` — the highest-value target (builds the shell **3×**: two early-return error cards at `:81` and `:97`, plus the main card at `:120`). Main card: `<WidgetCard eyebrow="Noise" headerRight={<span role="status" aria-live="polite" aria-atomic="true" className="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">fidelity {fidelityPct}%</span>}>`. The two error/limit cards use `eyebrow="Noise"` with a plain body `<p className="px-4 py-3 …">` (their headers are `flex items-center gap-2` with no chips → default header, normalized to `flex flex-wrap`; visually identical since there are no chips).
- `metrics-explorer.tsx` — `headerRight` for its status span.
- `cost-calculator.tsx`, `job-explorer.tsx` — these use non-default header padding (`px-4 sm:px-5 py-3`) and/or extra chips; pass a full `header={…}` node (still removes the outer-shell duplication, which is the main win). If the header padding exactly matches a `headerRight` render, prefer `headerRight`; otherwise `header`.

**5. Out of scope for Part A (document, do not migrate):** `device-table.tsx` (table-row chrome, not the explorable card), and the multi-eyebrow non-explorable chrome in `quiz.tsx`, `review-card.tsx`, `runnable-editor.tsx`, `scrolly-section.tsx`, `shots-sampler.tsx`, `challenge.tsx` (these have 2-3 eyebrows / bespoke layouts; forcing them through `WidgetCard` risks regressions for little dedup). State this explicitly in the PR description.

---

##### Part B — `LabeledSlider` (PR-B)

**6. Promote the donor `SliderRow` to `LabeledSlider` in `widget-ui.tsx`.** Generalize `param-compile-explorer.tsx:155-204` so it subsumes all 22 inputs. Signature:
```ts
import { useId } from "react"; // add to the React import in widget-ui.tsx

export function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  ariaLabel,
  ariaValueText,
  id,
  parse = "float",
  unit,
  className,
  labelClassName = "shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300",
  valueClassName = "w-16 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400",
}: {
  label: ReactNode;                 // glyph or word; rendered inside the <label>
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;    // drives the visible readout AND default aria-valuetext
  ariaLabel: string;
  ariaValueText?: string;           // override when the announcement differs from the readout
  id?: string;                      // else auto via useId()
  parse?: "float" | "int";
  unit?: ReactNode;                 // optional dimmed suffix after the value
  className?: string;               // appended to the row wrapper "flex items-center gap-3"
  labelClassName?: string;          // width/sizing override (e.g. "w-32 …", noise's "text-xs")
  valueClassName?: string;          // width override (w-8 … w-20)
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const toNum = parse === "int"
    ? (s: string) => parseInt(s, 10)
    : (s: string) => parseFloat(s);
  return (
    <div className={`flex items-center gap-3${className ? ` ${className}` : ""}`}>
      <label htmlFor={inputId} className={labelClassName}>{label}</label>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(toNum(e.target.value))}
        className="slider flex-1 focus-ring"
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText ?? format(value)}
      />
      <span className={valueClassName}>
        {format(value)}
        {unit !== undefined && (
          <span className="ml-1 text-gray-400 dark:text-gray-500">{unit}</span>
        )}
      </span>
    </div>
  );
}
```
Design notes grounded in the survey: `label` is `ReactNode` (glyphs/entities like `&#952;`, `x&#8320;`); `format` returns the **full readout string** (most widgets already bake the unit into it, e.g. `\`${theta.toFixed(2)} rad\``) and also feeds the **default** `aria-valuetext`; `ariaValueText` override exists because most radian sliders announce `"… radians"` while showing `"… rad"`, and `wavefunction-scrubber`/`pes-explorer`/`vqe-explorer` announce text fully decoupled from the readout (the `wavefunction-scrubber.test.tsx:38` assertion makes this mandatory). `unit` reproduces the donor's dimmed-suffix readout byte-identically. `labelClassName`/`valueClassName`/`className` absorb the width/spacing/font drift so each migrated row stays byte-identical. The `.slider flex-1 focus-ring` literal is fixed inside the primitive, preserving the WCAG 2.5.8 24px thumb (defined in `globals.css:274-292`) and the `.focus-ring` contract for all 22 inputs.

**7. Refactor the donor first (`param-compile-explorer.tsx`).** Delete the private `SliderRow` (`:155-204`) and replace its three call sites (`:286-324`) with `LabeledSlider`, mapping `display`→`format`, `unitLabel`→`unit`, keeping each `ariaLabel`/`ariaValueText`/`id` verbatim. Example (iterations):
```tsx
<LabeledSlider
  id={iterId}
  label="iterations"
  labelClassName="w-32 shrink-0 font-mono text-xs text-gray-600 dark:text-gray-300"
  valueClassName="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400"
  className="mt-3"
  value={iterations}
  min={ITER_MIN} max={ITER_MAX} step={1} parse="int"
  format={() => String(n)}
  unit="iter"
  ariaLabel="Number of loop iterations"
  ariaValueText={`${n} iterations`}
  onChange={(v) => setIterations(clamp(Math.round(v), ITER_MIN, ITER_MAX))}
/>
```
Run `npm test` (`param-compile-explorer.test.tsx`) — must stay green.

**8. Migrate the remaining 14 slider widgets (one per commit), preserving every `aria-*` and readout string.** For each, replace the `label/input/span` triple with `<LabeledSlider …/>`, passing `labelClassName`/`valueClassName`/`className` to match the current widths exactly. Specifics:
- `circuit-lab.tsx` (1): θ, `className="border-t border-gray-100 dark:border-gray-800 px-4 py-3"`, `labelClassName="font-mono text-sm text-gray-600 dark:text-gray-300"` (no fixed width), `valueClassName="w-16 …"`, `format={v=>`${v.toFixed(2)} rad`}`, `ariaValueText={`${theta.toFixed(2)} radians`}`.
- `bloch-builder-widget.tsx` (2): θ, φ; `labelClassName="font-mono text-sm … w-4 shrink-0"`, `className="border-t … px-4 py-3"`, keep `radians` aria override.
- `wavefunction-scrubber.tsx` (2): the **scrub** slider keeps `parse="int"`, `format={()=>`step ${safeStep}/${lastStep}`}`, `ariaValueText={`step ${safeStep} of ${lastStep}`}` (decoupled — required by the test); the θ slider mirrors circuit-lab. Note the scrub row also has the play button before the input — pass it via a wrapper or leave the play button as a sibling and use `LabeledSlider` only where the label is the slider; **simplest**: keep the play-button row custom (it has no text label) and migrate only the θ slider here, OR pass `label={<PlayButton/>}`. Recommended: migrate θ only; document scrub as a non-label control left custom.
- `grover-visualizer.tsx` (1): `label="iterations"`, `valueClassName="w-8 …"`, `parse="int"`, `format={()=>String(frame)}`, `ariaValueText={`${frame} iterations`}`, `className="border-t … px-4 py-3"`.
- `checkpoint-explorer.tsx` (2): `labelClassName="w-28 shrink-0 font-mono text-xs …"`, `valueClassName="w-10 …"`, `parse="int"`.
- `barren-explorer.tsx` (1): `label="depth"`, `valueClassName="w-8 …"`, `parse="int"`, `className="mt-4"`.
- `encoding-explorer.tsx` (2): x₀, x₁; `labelClassName="w-10 …"`, `valueClassName="w-14 …"`, `className="mt-3"` / `"mt-2"`.
- `hamiltonian-explorer.tsx` (1): `label="R"`, `labelClassName="w-8 …"`, `valueClassName="w-20 …"`, `format={v=>`${v.toFixed(R_PRECISION)} \u00C5`}`, `ariaValueText={`${R.toFixed(R_PRECISION)} Angstrom`}`.
- `kernel-explorer.tsx` (1): `label="scale"`, `labelClassName="w-16 …"`, `valueClassName="w-12 …"`, `className="mt-3"`.
- `pes-explorer.tsx` (1): `label="R"`, `valueClassName="w-16 …"`, `format={v=>`${v.toFixed(2)} \u00C5`}`, `ariaValueText` = the rich FCI/HF/gap string verbatim.
- `qaoa-explorer.tsx` (2): γ, β; `labelClassName="w-8 …"`, `valueClassName="w-14 …"`, `className="mt-3"`/`"mt-2"`.
- `vqe-explorer.tsx` (1): θ; `labelClassName="w-6 …"`, keep the rich `aria-valuetext` (energy) verbatim.
- `noise-visualizer.tsx` (1): `label={parameterLabel(channel)}`, `labelClassName="shrink-0 text-xs text-gray-600 dark:text-gray-300"` (no mono), `valueClassName="w-10 …"`, `format={()=>`${(pClamped*100).toFixed(0)}%`}`, `ariaLabel={parameterLabel(channel)}`. (Keep this Part-B commit independent of the Part-A noise refactor.)
- `job-explorer.tsx` (3): **stacked** layout (label above a nested `flex` with input+value). This does not fit the inline `LabeledSlider` row. Either (a) leave `job-explorer` sliders custom and document, or (b) add an optional `stacked?: boolean` to `LabeledSlider` that renders `<div className="flex flex-col gap-1"><label/><div className="flex items-center gap-3">{input}{value}</div></div>`. **Recommended:** leave `job-explorer` custom in this WP (3 inputs, unique layout) to avoid over-parameterizing the primitive; note as deferred.

Run `npm test` after each widget commit.

#### File & Code Changes

| Action | File Path | Description of Change |
|---|---|---|
| Modify | web/src/components/quantum/widget-ui.tsx | Add `import type { ReactNode }` + `useId`; add `cardShell` const, `EyebrowLabel`, `Chip`, `WidgetCard` (PR-A) and `LabeledSlider` (PR-B); refactor `ErrorCard` to compose `cardShell`. |
| Create | web/__tests__/components/quantum/widget-ui.test.tsx | New render tests for `WidgetCard`/`EyebrowLabel`/`Chip`/`LabeledSlider` (see Testing). |
| Modify | web/src/components/quantum/circuit-lab.tsx | A: header→`WidgetCard`. B: θ slider→`LabeledSlider`. |
| Modify | web/src/components/quantum/bloch-builder-widget.tsx | A: header→`WidgetCard` (GateChip via `chips`). B: θ, φ→`LabeledSlider`. |
| Modify | web/src/components/quantum/wavefunction-scrubber.tsx | A: header→`WidgetCard`; inline parse-error card→`WidgetCard`/`ErrorCard`. B: θ→`LabeledSlider` (scrub kept custom). |
| Modify | web/src/components/quantum/grover-visualizer.tsx | A: header→`WidgetCard` (2 `Chip`s). B: iterations→`LabeledSlider`. |
| Modify | web/src/components/quantum/param-compile-explorer.tsx | A: header→`WidgetCard`. B: delete private `SliderRow` (:155-204); 3 sliders→`LabeledSlider` (donor). |
| Modify | web/src/components/quantum/checkpoint-explorer.tsx | A: header→`WidgetCard` (`eyebrowAs="h3"`, `eyebrowId`). B: failAt, every→`LabeledSlider`. |
| Modify | web/src/components/quantum/barren-explorer.tsx | A: header→`WidgetCard`. B: depth→`LabeledSlider`. |
| Modify | web/src/components/quantum/kernel-explorer.tsx | A: header→`WidgetCard`. B: scale→`LabeledSlider`. |
| Modify | web/src/components/quantum/hamiltonian-explorer.tsx | A: header→`WidgetCard`. B: R→`LabeledSlider`. |
| Modify | web/src/components/quantum/pes-explorer.tsx | A: header→`WidgetCard`. B: R→`LabeledSlider` (rich `ariaValueText`). |
| Modify | web/src/components/quantum/qaoa-explorer.tsx | A: header→`WidgetCard`. B: γ, β→`LabeledSlider`. |
| Modify | web/src/components/quantum/vqe-explorer.tsx | A: header→`WidgetCard`. B: θ→`LabeledSlider` (rich `ariaValueText`). |
| Modify | web/src/components/quantum/encoding-explorer.tsx | A: header→`WidgetCard`. B: x₀, x₁→`LabeledSlider`. |
| Modify | web/src/components/quantum/noise-visualizer.tsx | A: 3 shells→`WidgetCard` (main uses `headerRight`). B: error-rate slider→`LabeledSlider`. |
| Modify | web/src/components/quantum/metrics-explorer.tsx | A: header→`WidgetCard` (`headerRight`). (No slider.) |
| Modify | web/src/components/quantum/correlation-demo.tsx | A: header→`WidgetCard`. |
| Modify | web/src/components/quantum/dj-demo.tsx | A: header→`WidgetCard`. |
| Modify | web/src/components/quantum/jw-explorer.tsx | A: header→`WidgetCard`. |
| Modify | web/src/components/quantum/topology-explorer.tsx | A: header→`WidgetCard`. |
| Modify | web/src/components/quantum/qft-visualizer.tsx | A: header→`WidgetCard`. |
| Modify | web/src/components/quantum/vqc-trainer.tsx | A: header→`WidgetCard`. |
| Modify | web/src/components/quantum/cost-calculator.tsx | A: header→`WidgetCard` via full `header={…}` (custom padding). |
| Modify | web/src/components/quantum/job-explorer.tsx | A: header→`WidgetCard` via `header={…}`. B: 3 sliders deferred (stacked layout, documented). |
| (No change) | web/src/components/quantum/device-table.tsx, challenge.tsx, quiz.tsx, review-card.tsx, runnable-editor.tsx, shots-sampler.tsx, scrolly-section.tsx | Out of scope (non-explorable / multi-eyebrow chrome); rationale in PR body. |

#### Testing & Validation

**New unit/render tests — `web/__tests__/components/quantum/widget-ui.test.tsx`:**
- `WidgetCard`: renders children; with `eyebrow="X"` emits a header row containing "X" and the eyebrow class, and adds `overflow-hidden`; without `eyebrow`/`header` emits no `border-b` header and no `overflow-hidden`; `chips` render inside the header; `headerRight` produces a `justify-between` header; `header` overrides eyebrow/chips; outer div carries `not-prose` + the `cardShell` classes + the `className` margin.
- `EyebrowLabel`: default renders a `<span>`; `as="h3"` renders an `<h3>` with the passed `id` (assert `screen.getByRole("heading")`).
- `Chip`: renders a `<span>` with `rounded-chip` + gray classes and its text.
- `LabeledSlider`: renders a `role="slider"` with the given `aria-label`; `aria-valuetext` defaults to `format(value)` and is overridden by `ariaValueText`; the readout shows `format(value)` and (when `unit` given) the dimmed unit; `parse="int"` calls `onChange` with an integer and `parse="float"` with a float on `fireEvent.change`; the input carries `slider flex-1 focus-ring`; `labelClassName`/`valueClassName`/`className` overrides appear on the right nodes.
- `ErrorCard`: regression — still renders `"<label> error: <message>"` and now carries the `cardShell` classes + `px-4 py-3`.

**Existing tests that must stay green unchanged (do not edit):** `wavefunction-scrubber.test.tsx` (`aria-valuetext` `/step \d+ of \d+/`, `getByRole("slider",{name:/step/i})`), `bloch-builder-widget.test.tsx` (`getByLabelText` on θ/φ), `noise-visualizer.test.tsx` (`getByLabelText(/depolarizing p/i)`), `vqe-explorer.test.tsx` (`getByRole("slider")` value clamp), plus every per-widget render test. Their passing is the primary proof the migration preserved `aria-label`/`aria-valuetext`/roles.

**Verify commands (run after each commit, and before each PR):**
```
cd web && npm run lint && npm test && npm run build
```
Expect: lint clean, ~479+ jest green (new file adds tests), static export = 12 pages.

**Manual browser verification (`npm run dev`, open a lesson page rendering each family):**
- Header: confirm eyebrow color/case/tracking and chip pills look identical pre/post; resize narrow to confirm chips wrap (the `flex-wrap` normalization) rather than overflow.
- `noise-visualizer`: confirm the right-aligned "fidelity NN%" status still sits opposite the eyebrow (justify-between via `headerRight`), and both error/limit states still render the card.
- Sliders: drag each migrated slider — thumb is the large 24px accent thumb, keyboard-focus shows the `.focus-ring`, the tabular-nums readout updates, and (VoiceOver/NVDA or devtools accessibility pane) the `aria-valuetext` announces the expected string (e.g. `1.57 radians`, `step 2 of 2`, the pes FCI/HF/gap string).
- Dark mode toggle: confirm shell border/bg, chip, eyebrow, and slider track colors match the pre-migration build.

**Clean rollback:** each PR is a single squash-merge commit; `git revert <sha>` on `main` (or close-without-merge before merge) fully restores the prior chrome — the primitives are additive and every migration is a pure in-file swap, so a revert leaves no dangling imports.

#### Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Visual regression from header normalization (`flex`→`flex flex-wrap`, eyebrow/chip drift) | Med | Med | `flex-wrap` is visually identical at normal widths and is the intended drift-fix; `justify-between`/padded widgets use `header`/`headerRight` to stay byte-identical; manual side-by-side + dark-mode check per family; revert is one command. |
| a11y regression (changed `aria-label`/`aria-valuetext`, lost heading semantics) | Med | High | Preserve every `aria-*` string verbatim via per-call props; `ariaValueText` override keeps the announce/readout decoupling (`step X of Y`, pes/vqe rich text); `eyebrowAs="h3"`+`id` preserves `checkpoint` heading; existing `getByLabelText`/`getByRole` tests guard this. |
| Test breakage from DOM/string drift | Med | Med | Keep readout text and roles identical; run `npm test` after **each** widget commit (incremental green); add `widget-ui.test.tsx` before migrating consumers. |
| Tailwind not emitting a class after centralization (content-scan miss) | Low | Med | `cardShell` and all class literals are flat strings (no runtime interpolation of class fragments); `npm run build` static export confirms classes survive; spot-check computed styles in browser. |
| `LabeledSlider` over/under-parameterized → forces visual change | Med | Med | `labelClassName`/`valueClassName`/`className` absorb width/spacing/font drift; `unit` reproduces the dimmed suffix; `parse` toggles int/float; outliers (`job-explorer` stacked, `wavefunction` scrub button, `pes`/`vqe` rich aria) handled explicitly or deferred with rationale. |
| Donor-removal breakage (`param-compile` private `SliderRow`) | Low | Med | Refactor donor in the first PR-B commit and run its test immediately; the private `SliderRow` is local to that file (no external importers — `grep` confirms it is unexported). |
| Merge conflicts between PR-A and PR-B (both touch ~15 shared files) | Med | Low | Land PR-A fully (merge to `main`) before opening PR-B, so PR-B branches off post-migration headers; or sequence as instructed below. |

#### Dependencies & Order of Operations
- **Primitives before migrations (hard dependency):** Step 1 (`cardShell`/`EyebrowLabel`/`Chip`/`WidgetCard`) must land before Steps 3-5; Step 6 (`LabeledSlider`) before Steps 7-8.
- **PR-A before PR-B (recommended):** both modify the same ~15 slider widgets; merging PR-A first lets PR-B branch off fresh `main` and avoids conflicts. Within PR-A, migrate the donor/simple widgets first, `noise-visualizer` (3× shell) for max payoff, then the rest. Within PR-B, refactor the donor (`param-compile`) first, then the 14 widgets.
- **Parallelizable:** the widget(test) tests are independent — once a primitive exists, individual widget migrations can be done in any order / by parallel agents, each its own green commit.
- **Relative to other WS-6x packages:** WS-6c is the foundational shell/slider extraction; other WS-6x widget-polish packages that touch the same chrome should land **after** WS-6c (or rebase onto it) to consume the primitives rather than re-hand-rolling the chrome. No dependency on tutor/lab packages.
- **Suggested sequence:** (1) PR-A commit 1 = primitives + `ErrorCard` + `widget-ui.test.tsx`; commits 2..n = header migrations (one widget each); squash-merge when 3 CI checks green. (2) PR-B commit 1 = `LabeledSlider` + donor refactor + slider tests; commits 2..n = slider migrations; squash-merge when green.

#### Estimated Effort
- **Complexity:** High (largest WP — ~24 files touched across two PRs; many small byte-faithful edits; a11y-string fidelity is the main care-factor).
- **Time:** ~6-9 hours total (PR-A ~3.5-5h: 4 primitives + `ErrorCard` + ~22 header migrations + tests; PR-B ~2.5-4h: 1 primitive + donor + ~14 slider widgets + tests), including lint/test/build cycles and manual browser verification.
- **File count:** Create 1 (`widget-ui.test.tsx`); Modify ~24 (`widget-ui.tsx` + ~23 widgets across both PRs); Delete 0 files (one private `SliderRow` function removed inside `param-compile-explorer.tsx`).


---

### WS-6d — Finish the ProbBars consolidation

#### Objective
Today six algorithm/ML explorables each hand-roll the probability-bar row that the shared `ProbBars` (web/src/components/quantum/widget-ui.tsx:58-79) already encapsulates, and `ProbBars` itself ships a `transition-[width]` fill with no `prefers-reduced-motion` guard. This package factors a tiny exported `Bar` row primitive, rebuilds `ProbBars` on it with an optional `labelFor` override plus a `motion-reduce:transition-none` guard (which also fixes circuit-lab/scrubber/bloch-builder), then migrates `dj-demo` and `encoding-explorer` to call `ProbBars` directly, `qaoa-explorer` to call `ProbBars` with `labelFor={vertexLabel}`, and rebuilds `grover-visualizer`'s highlighted bars and `qft-visualizer`'s `MagnitudeBars` on `Bar`. `noise-visualizer` is deliberately left untouched (its bars are a different shape). The result removes five copies of the bar row, gives every consolidated bar a reduced-motion guard, and changes no visuals (one negligible label-width delta in dj-demo, justified below).

#### Prerequisites
- Repo at `/Users/cperez/dev/altivum-dev/quantum/web`, deps installed (`npm ci` already run; `node_modules` present).
- Knowledge of the existing conventions confirmed by reading the files: `basisLabel(i, n)` is MSB-first (math.ts:236-238); `vertexLabel(idx, n)` in qaoa-explorer.tsx:28-32 is LSB-first and has the exact signature `(idx: number, n: number) => string`; `widget-ui.tsx` already imports `basisLabel` (line 1) so it is available as the default `labelFor`.
- Verified there are NO snapshot tests and NO `toHaveClass`/className/transition assertions in `web/__tests__/components/quantum/` (grep returned empty), so Tailwind class re-ordering and the added motion-reduce utility cannot break existing tests — all assertions are text/behavior based.
- Tailwind v4 tokens already in use by these bars: `bg-accent`, `bg-warm`, `rounded-full`, `tabular-nums`, `motion-reduce:*`. No new tokens or globals.css changes needed.
- Branch off fresh `main` (`git switch -c ws-6d-probbars-consolidation`).

#### Step-by-Step Implementation

**1. Add the `Bar` primitive and rebuild `ProbBars` in `web/src/components/quantum/widget-ui.tsx`.**

1.1. Insert a new exported `Bar` function immediately above `ProbBars` (so it sits at ~line 57, before the current line 58). Exact signature and body:

```tsx
/**
 * One labeled progress row: |label⟩ ──fill── valueText. The shared building
 * block behind ProbBars, Grover's amplitude bars, and the QFT MagnitudeBars.
 * `fraction` is clamped to [0,1] for the fill width; `fillClass` sets the bar
 * color; label/value text colors are overridable for highlighted rows. The fill
 * animates width but is guarded by motion-reduce:transition-none for a11y.
 */
export function Bar({
  label,
  fraction,
  valueText,
  fillClass = "bg-accent",
  labelClassName = "text-gray-500 dark:text-gray-400",
  valueClassName = "text-gray-500 dark:text-gray-400",
}: {
  label: string;
  fraction: number;
  valueText: string;
  fillClass?: string;
  labelClassName?: string;
  valueClassName?: string;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-12 shrink-0 font-mono text-xs ${labelClassName}`}>
        |{label}&#10217;
      </span>
      <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 motion-reduce:transition-none ${fillClass}`}
          style={{ width: `${pct.toFixed(2)}%` }}
        />
      </span>
      <span className={`w-12 shrink-0 text-right font-mono text-xs tabular-nums ${valueClassName}`}>
        {valueText}
      </span>
    </div>
  );
}
```

Edge cases handled: `fraction` clamped to [0,1] so a stray >1 or negative input can never overflow the track or produce a negative width; all current callers pass values already in [0,1] so output is byte-identical to today (`(p*100).toFixed(2)%`). The `|{label}&#10217;` wrapping reproduces the exact `|…⟩` ket markup all six widgets use. Bar renders ONE row only — the `space-y-1.5` list wrapper stays in each consumer.

1.2. Replace the body of `ProbBars` (currently lines 58-79) so it maps onto `Bar` and accepts an optional `labelFor`:

```tsx
/** Probability bars: one row per basis state (|label⟩, accent fill, percentage). */
export function ProbBars({
  probs,
  n,
  labelFor = basisLabel,
}: {
  probs: number[];
  n: number;
  labelFor?: (idx: number, n: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      {probs.map((p, idx) => (
        <Bar
          key={idx}
          label={labelFor(idx, n)}
          fraction={p}
          valueText={`${(p * 100).toFixed(1)}%`}
        />
      ))}
    </div>
  );
}
```

Behavior delta vs. current `ProbBars`: identical label (`basisLabel` default), identical width string, identical `%` value, identical track markup — the ONLY change is the fill now carries `motion-reduce:transition-none`. This is the intended a11y fix and it propagates to the three existing direct consumers (circuit-lab.tsx:50, wavefunction-scrubber.tsx:101, bloch-builder-widget.tsx:49) with no visual change for motion-OK users.

**2. Migrate `dj-demo.tsx` to direct `ProbBars`.**

2.1. Change the widget-ui import (line 4) from `import { ErrorCard as SharedErrorCard } from "./widget-ui";` to `import { ErrorCard as SharedErrorCard, ProbBars } from "./widget-ui";`.

2.2. Remove the now-unused `import { basisLabel } from "./math";` (line 5) — after this migration `basisLabel` is referenced nowhere else in the file (only at line 115), so leaving it triggers a `no-unused-vars` lint error.

2.3. Replace the entire hand-rolled bar block (lines 111-128, the `<div className="space-y-1.5">…</div>`) with:

```tsx
<ProbBars probs={result.probs} n={result.n} />
```

Edge case / visual note: the hand-rolled dj label cell was `w-16` (dj-demo.tsx:114) vs. `ProbBars`'s `w-12`. dj only renders 2- or 3-qubit labels (`"00"`..`"111"`, ≤3 chars at `text-xs` mono ≈ 35px), which fit inside `w-12` (48px), so the row narrows by 16px of slack with no clipping. This is the one intentional pixel delta in the package.

**3. Migrate `qaoa-explorer.tsx` to `ProbBars` with `labelFor={vertexLabel}`.**

3.1. Add `ProbBars` to the widget-ui import (line 4): `import { ErrorCard as SharedErrorCard, ProbBars } from "./widget-ui";`.

3.2. Keep the local `vertexLabel(idx, n)` function (lines 28-32) — it is now passed as `labelFor`; its signature `(idx, n) => string` already matches.

3.3. Replace the hand-rolled distribution bar block (lines 381-398, the `<div className="mt-4 space-y-1.5">…</div>`) with a wrapper that preserves the `mt-4` top margin plus the shared bars:

```tsx
<div className="mt-4">
  <ProbBars probs={distribution} n={n} labelFor={vertexLabel} />
</div>
```

3.4. Leave the trailing `<p className="mt-1.5 …">bit order: vertex 0 on the left …</p>` note (lines 399-401) exactly in place — it is the teaching caption for the LSB-first ordering and must survive. The current hand-rolled fill already had `motion-reduce:transition-none` (line 389), so behavior is unchanged.

**4. Migrate `encoding-explorer.tsx` amplitude bars to direct `ProbBars`.**

4.1. Add a widget-ui import (encoding-explorer currently imports nothing from widget-ui): `import { ProbBars } from "./widget-ui";`.

4.2. Change the math import (line 4) from `import { basisLabel, cAbs2, type Complex } from "./math";` to `import { cAbs2, type Complex } from "./math";` — after migration `basisLabel` is unused (its only use was line 207); `cAbs2` is still used for `norm` (line 94) and for the probs map below.

4.3. Replace the hand-rolled amplitude-bar block (lines 201-221, the `<div className="mt-4 space-y-1.5">{state.map(...)}</div>`) with:

```tsx
<div className="mt-4">
  <ProbBars probs={state.map(cAbs2)} n={n} />
</div>
```

These bars were already structurally identical to `ProbBars` (default `basisLabel`, `bg-accent` fill, `(p*100).toFixed(1)%` value, `w-12` label, and they already had `motion-reduce:transition-none`), so this is a zero-visual-change migration. `n` (line 91) and the `state`/`dirac`/`norm` readouts below are untouched.

**5. Rebuild `grover-visualizer.tsx`'s highlighted bars on `Bar`.**

5.1. Add `Bar` to the widget-ui import (line 4): `import { ErrorCard as SharedErrorCard, Bar } from "./widget-ui";`.

5.2. Keep `import { basisLabel } from "./math";` (line 5) — still used for the Bar label, the header (line 100), and the marked-select options (line 201).

5.3. Replace the inner map of the bar block (lines 106-133) — the `amps.map(...)` returning the full row — with a `Bar` call that carries grover's conditional label color and conditional fill, leaving the outer `<div className="space-y-1.5">` (line 105) in place:

```tsx
{amps.map((amp, idx) => {
  const p = amp * amp;
  const isMarked = idx === marked;
  return (
    <Bar
      key={idx}
      label={basisLabel(idx, n)}
      fraction={p}
      fillClass={isMarked ? "bg-accent" : "bg-gray-300 dark:bg-gray-600"}
      valueText={`${(p * 100).toFixed(1)}%`}
      labelClassName={
        isMarked
          ? "text-accent-dark dark:text-accent-light font-semibold"
          : "text-gray-500 dark:text-gray-400"
      }
    />
  );
})}
```

This reproduces grover's marked-row styling exactly: accent fill + accent-dark/-light bold label for the marked state, gray fill + gray label otherwise. Value color stays the default gray (matches current line 128). The current grover fill already had `motion-reduce:transition-none`, so behavior is identical.

**6. Rebuild `qft-visualizer.tsx`'s `MagnitudeBars` on `Bar`.**

6.1. Add `Bar` to the widget-ui import (line 4): `import { ErrorCard as SharedErrorCard, Bar } from "./widget-ui";`.

6.2. Keep `basisLabel` in the math import (line 5) — still used for the Bar label and the teaching `note` (line 155).

6.3. Replace the inner map of `MagnitudeBars` (lines 96-123) — keep its `peak` computation (line 94), its outer `<div className="space-y-1.5">`, and its `{values, n, highlight, accent}` props signature — with rows built from `Bar`:

```tsx
const peak = Math.max(...values, 1e-12);
return (
  <div className="space-y-1.5">
    {values.map((v, idx) => {
      const hot = highlight ? highlight(idx) : false;
      const fillClass = hot
        ? "bg-warm"
        : accent
          ? "bg-accent"
          : "bg-gray-400 dark:bg-gray-500";
      return (
        <Bar
          key={idx}
          label={basisLabel(idx, n)}
          fraction={v / peak}
          fillClass={fillClass}
          valueText={v.toFixed(2)}
        />
      );
    })}
  </div>
);
```

Behavior: peak normalization (`v / peak`) and the magnitude value text (`v.toFixed(2)`, not a percentage) are preserved; the three-way fill (`bg-warm` spike / `bg-accent` / `bg-gray-400 dark:bg-gray-500`) is preserved. One equivalence to note: the old fill used `motion-safe:transition-[width] motion-safe:duration-200` (qft-visualizer.tsx:107), Bar uses `transition-[width] duration-200 motion-reduce:transition-none`. These are functionally equivalent — both yield a width transition when motion is allowed and none under `prefers-reduced-motion`.

**7. Leave `noise-visualizer.tsx` unchanged (documented boundary).**

Do NOT migrate it. Its rows (noise-visualizer.tsx:147-184) are a fundamentally different shape that `Bar`/`ProbBars` cannot express without over-generalizing the primitive: (a) two stacked sub-bars per basis row (ideal `bg-accent` + noisy `bg-amber-500`); (b) bar height `h-2.5`, not Bar's `h-3`; (c) **intentionally no width transition** — the inline comment (lines 136-139) explains the bars track the deferred Kraus simulation 1:1 and dim via container opacity/`aria-busy` instead; (d) non-ket sub-labels (`"ideal"`/`"noisy"` in `w-8` cells) that Bar's `|label⟩` wrapper does not produce. Adding height/animate/raw-label props to satisfy noise would bloat the "tiny" primitive and risk the other consumers, so noise stays as-is. Record this rationale in the PR description.

#### File & Code Changes

| Action | File Path | Description of Change |
|---|---|---|
| Modify | web/src/components/quantum/widget-ui.tsx | Add exported `Bar({label,fraction,valueText,fillClass?,labelClassName?,valueClassName?})` row primitive above `ProbBars`; add `motion-reduce:transition-none` to the fill; rebuild `ProbBars` on `Bar` and add optional `labelFor?: (idx,n)=>string` (default `basisLabel`). |
| Modify | web/src/components/quantum/dj-demo.tsx | Import `ProbBars`; remove unused `basisLabel` import; replace hand-rolled bar block (~:111-128) with `<ProbBars probs={result.probs} n={result.n} />`. |
| Modify | web/src/components/quantum/qaoa-explorer.tsx | Import `ProbBars`; replace distribution bar block (~:381-398) with `<div className="mt-4"><ProbBars probs={distribution} n={n} labelFor={vertexLabel} /></div>`; keep `vertexLabel` and the bit-order caption. |
| Modify | web/src/components/quantum/encoding-explorer.tsx | Add `ProbBars` import; drop unused `basisLabel` from math import; replace amplitude bar block (~:201-221) with `<div className="mt-4"><ProbBars probs={state.map(cAbs2)} n={n} /></div>`. |
| Modify | web/src/components/quantum/grover-visualizer.tsx | Import `Bar`; replace the `amps.map` row body (~:106-133) with `Bar` carrying conditional `fillClass` + `labelClassName` for the marked state; keep outer `space-y-1.5` and `basisLabel`. |
| Modify | web/src/components/quantum/qft-visualizer.tsx | Import `Bar`; rebuild `MagnitudeBars` inner map (~:96-123) on `Bar` using `fraction={v/peak}`, three-way `fillClass`, `valueText={v.toFixed(2)}`; keep props/peak/wrapper. |
| Create | web/__tests__/components/quantum/widget-ui.test.tsx | New jsdom render tests for `ProbBars` (default labels, `labelFor` override, motion-reduce guard present) and `Bar` (label/value/fill rendering, fraction clamp). |
| Modify | web/__tests__/components/quantum/qaoa-explorer.test.tsx | Add assertion that the bit-order caption ("vertex 0 on the left") and 8 percentage bars still render after the `labelFor` migration. |
| Modify | web/__tests__/components/quantum/encoding-explorer.test.tsx | Add assertion that 4 percentage bars render via `ProbBars` after migration. |
| Modify | web/__tests__/components/quantum/qft-visualizer.test.tsx | Add assertion that magnitude value text (e.g. a `\d\.\d\d` row value) renders via the `Bar`-based `MagnitudeBars`. |
| — | web/src/components/quantum/noise-visualizer.tsx | NO CHANGE (documented out-of-scope: stacked dual-bar, `h-2.5`, intentional no-transition, non-ket sub-labels). |

#### Testing & Validation

**New/extended tests:**
- `web/__tests__/components/quantum/widget-ui.test.tsx` (create): (1) `render(<ProbBars probs={[0.25,0.75]} n={1} />)` asserts `|0⟩`/`|1⟩` labels and `25.0%`/`75.0%` appear. (2) `render(<ProbBars probs={[1,0,0,0]} n={2} labelFor={(i,n)=>`v${i}`} />)` asserts custom label `v0` appears and `basisLabel` form `00` does NOT (proves `labelFor` override). (3) Render `ProbBars`, query the fill span via `container.querySelector('span[style]')` and assert its `className` includes `motion-reduce:transition-none` (proves the a11y guard). (4) `render(<Bar label="01" fraction={1.5} valueText="x" />)` asserts width style clamps to `100.00%` and value text `x` renders.
- `qaoa-explorer.test.tsx` (extend): add `expect(screen.getByText(/vertex 0 on the left/i)).toBeInTheDocument()` and `expect(screen.getAllByText(/%$/).length).toBeGreaterThanOrEqual(8)`.
- `encoding-explorer.test.tsx` (extend): add `expect(screen.getAllByText(/%$/).length).toBeGreaterThanOrEqual(4)`.
- `qft-visualizer.test.tsx` (extend): for `{qubits:3,input:"period:4"}`, add `expect(screen.getAllByText(/^\d\.\d\d$/).length).toBeGreaterThan(0)` (magnitude values render via Bar).
- Existing dj/grover tests need no edits — they assert headers/verdict text which are unchanged; run them to confirm.

**Verify commands (from `web/`):**
```
cd web && npm run lint && npm test && npm run build
```
Expect: lint clean (watch specifically for `no-unused-vars` on the removed `basisLabel` imports in dj-demo and encoding-explorer), all jest tests green (~479 existing + the new widget-ui cases), static export = 12 pages. Also run `npm run test:e2e` only if the build changed runtime behavior — it did not, so it is optional here.

**Manual browser verification (`npm run dev`, port 3000):** Open guides that embed each widget and confirm visuals are unchanged:
- dj-demo (`qdj` block): switch the Oracle select; bars render with `|000⟩`-style labels and percentages; verdict pill flips Constant/Balanced.
- qaoa (`qoptim` block): drag γ/β; distribution bars update; vertex-order labels and the "vertex 0 on the left" caption are present.
- grover (`qgrover` block): drag the iterations slider; the marked row stays accent-filled with a bold accent label while others are gray.
- qft (`qft` block): the output column shows `bg-warm` spike bars at every N/r; magnitude values read like `1.00`/`0.50`.
- encoding (`qencode` block): switch Map and drag x₀/x₁; amplitude bars and norm readout update.
- noise (`qnoise` block): confirm it is visually identical to before (no transition on the bars).
- In OS settings enable "Reduce motion", reload, drag the grover/qaoa/circuit-lab sliders, and confirm the bar fills jump instantly (no width animation) — proving the new `motion-reduce:transition-none` guard.

**Clean rollback:** This is a single squashed PR. `git revert <merge_commit_sha> -m 1` restores all six widgets and `widget-ui.tsx` to their pre-PR state and drops the four test changes; no migrations, env, or data are involved, so revert is fully sufficient.

#### Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Visual regression in dj-demo from `w-16`→`w-12` label cell | Med | Low | Labels are ≤3 chars (`"000"`) and fit in `w-12` (48px); verified no clipping in browser step; alternative is to keep dj hand-rolled, but the task specifies direct `ProbBars`. Documented as the one intended pixel delta. |
| qft motion behavior changes (`motion-safe:` → `motion-reduce:` form) | Low | Low | The two forms are functionally equivalent (transition when motion allowed, none when reduced); confirmed via the reduce-motion browser step. |
| a11y regression — fill animating under reduced motion | Low | Med | The whole point of this package is to ADD `motion-reduce:transition-none` to `Bar`/`ProbBars`; verified in the OS reduce-motion browser step. Net a11y improvement (also fixes circuit-lab/scrubber/bloch-builder). |
| Test breakage in the 3 existing `ProbBars` consumers (circuit-lab, scrubber, bloch-builder) | Low | Med | Grep confirmed their tests assert text/behavior only, never class names or snapshots; class re-ordering and the added utility cannot affect them. Full `npm test` run gates the merge. |
| Lint failure from now-unused `basisLabel` imports (dj-demo, encoding) | Med | Low | Steps 2.2 and 4.2 remove those imports explicitly; `npm run lint` in the verify gate catches any miss. |
| Over-generalizing `Bar` to absorb noise-visualizer, bloating the primitive | Low | Med | Explicitly out of scope (Step 7); `Bar` stays tiny with fixed `h-3` + ket label; noise documented as an intentional non-migration. |
| Tailwind cascade pitfall — interpolated `${fillClass}` not detected by the JIT compiler | Low | Med | All fill classes passed are static string literals already present elsewhere in the codebase (`bg-accent`, `bg-warm`, `bg-gray-300 dark:bg-gray-600`, `bg-gray-400 dark:bg-gray-500`), so the compiler already emits them; no dynamically-constructed class names are introduced. `npm run build` confirms the classes survive the production build. |

#### Dependencies & Order of Operations
- **Step 1 (widget-ui: `Bar` + `ProbBars`) is the hard prerequisite** for Steps 2-6 — it defines the primitives they import. Do it first and keep it in the same PR.
- Steps 2-6 are **mutually independent** and can be done in any order or in parallel (each touches a different widget file); Step 7 is a no-op.
- Test changes: the new `widget-ui.test.tsx` depends only on Step 1; the three extended widget tests depend on their respective migrations (Steps 3, 4, 6).
- **Cross-package ordering:** this WS-6d is the "primitives before migrations" tail of the WS-2a/WS-2b ProbBars single-sourcing line of work and depends on nothing else outstanding. It should land as one self-contained PR. If any future WS-6x package also factors shared primitives into `widget-ui.tsx`, sequence this one first (or rebase) to avoid import-surface conflicts, since it is the package that introduces `Bar` and the `labelFor` prop.
- Suggested internal sequence: 1 → 5 (grover, exercises `Bar` directly) → 6 (qft, exercises `Bar` three-way fill) → 2/3/4 (the `ProbBars` direct/`labelFor` migrations) → tests → verify gate.

#### Estimated Effort
- **Complexity:** Low–Medium (mechanical refactor with one carefully-shaped new primitive; the only judgment calls — dj `w-16` delta, qft motion-class equivalence, noise non-migration — are pre-resolved above).
- **Time:** ~1.5–2.5 hours including the verify gate and manual browser/reduced-motion checks.
- **File count:** 6 modified components (widget-ui, dj-demo, qaoa-explorer, encoding-explorer, grover-visualizer, qft-visualizer) + 1 created test + 3 modified tests = **6 modify (src), 1 create + 3 modify (tests), 0 delete**; noise-visualizer explicitly untouched.


---

### WS-6e — Caption contrast token (WCAG AA)

#### Objective
The de-emphasized caption color in the explorables is currently written as the literal Tailwind pair `text-gray-400 dark:text-gray-500`, which fails WCAG AA for small text: in light mode gray-400 (`#9ca3af`) on the white card is ~2.7:1 and in dark mode gray-500 (`#6b7280`) on the `--surface-1` (`#0d1320`) card is ~4.1:1 (borderline). This package defines one shared, provably-AA caption utility class `.text-caption` (= `text-gray-500 dark:text-gray-400`, ~4.5–4.8:1 light / ~6.9:1 dark) in `globals.css` and migrates every de-emphasized **text** caption that uses the inverted pair to it. Net effect: footnote/caption text becomes one step darker in light mode and one step lighter in dark mode — readable in both — while the muted color is now defined in exactly one place.

#### Prerequisites
- Repo checked out on a fresh branch off `main`; Node toolchain already installed (`cd web && npm ci` if needogg).
- Familiarity with the Tailwind v4 custom-utility convention already used in `web/src/app/globals.css` `@layer utilities` (`.focus-ring`, `.interactive`, `.slider`, `.text-gradient` all use `@apply ... dark:...`).
- Understanding of the key gotcha from `web/CLAUDE.md`: `@theme inline` color tokens compile statically and **cannot** switch by theme at runtime, so a single `--color-caption` token would NOT work for light/dark. The fix must be a utility **class** that carries the `dark:` variant internally (via `@apply`), exactly mirroring `.focus-ring`/`.slider`.
- WCAG knowledge: 1.4.3 (text contrast 4.5:1 for <18px) applies to caption **text**; 1.4.11 (non-text contrast 3:1) governs SVG graphical strokes — so decorative SVG reference lines are intentionally out of scope.
- Verify command in `web/`: `npm run lint && npm test && npm run build` (currently ~479 jest tests; static export = 12 pages).

#### Step-by-Step Implementation

**1. Define the shared caption utility in `globals.css`.**
1.1. Open `web/src/app/globals.css`. In the existing `@layer utilities { ... }` block (lines 245–339), immediately after the `.slider` rules (i.e. after line 292, before `.text-gradient` at 294), add a new utility that wraps the already-passing pair:
```css
/* De-emphasized footnote/caption text. Single source for the muted tier so it
   stays provably WCAG-AA in both themes: gray-500 on white ~4.6:1, gray-400 on
   the dark card ~6.9:1. Replaces the inverted, sub-AA `text-gray-400
   dark:text-gray-500` literal that was copy-pasted across the explorables. */
.text-caption {
  @apply text-gray-500 dark:text-gray-400;
}
```
1.2. Rationale for `@apply` (not a `--color-*` token): `@apply text-gray-500 dark:text-gray-400` expands the `dark:` variant `&:where(.dark, .dark *)` inline — the exact pattern `.focus-ring` (line 262) and `.slider` (line 271) already use. This is theme-correct where a `@theme inline` token would not be.
1.3. Do NOT change any `@theme inline` block, no new `--color-*` entries. No change to specificity-sensitive unlayered rules at the bottom of the file.

**2. Migrate `StateReadout` in the shared primitive (highest-leverage site).**
2.1. In `web/src/components/quantum/widget-ui.tsx` line 86, change the muted prefix span:
   - From: `<span className="text-gray-400 dark:text-gray-500">|&#968;&#10217; = </span>`
   - To:   `<span className="text-caption">|&#968;&#10217; = </span>`
2.2. Edge case: the parent `<p>` (line 85) is `text-gray-700 dark:text-gray-200` and the value span (line 87) is `text-accent`; the prefix remains the most-muted tier (gray-500/gray-400) — hierarchy preserved. This single change fixes the prefix everywhere `StateReadout` is consumed (circuit-lab, wavefunction-scrubber, correlation-demo, bloch-builder).

**3. Migrate the WP-named caption sites (text only).** For each, replace the exact substring `text-gray-400 dark:text-gray-500` with `text-caption`, keeping all other utilities on the element unchanged (e.g. `text-[10px] ... font-mono` stays; only the color pair is swapped). Use Edit `replace_all: true` on the literal where every occurrence in the file is a text site (see 3.x notes); use targeted edits where an excluded site shares the literal.
3.1. `dj-demo.tsx:130` — `<p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">` → `text-xs text-caption leading-relaxed`. (1 occurrence; single edit.)
3.2. `qaoa-explorer.tsx:322` and `:399` — both `<p>` captions (`...text-[10px] text-gray-400 dark:text-gray-500 font-mono`). The two BAD occurrences are both text; `replace_all` of the literal is safe (qaoa SVG strokes use `stroke="currentColor"` and do NOT carry the gray pair).
3.3. `encoding-explorer.tsx:118/124/128` — three `<span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">` BlochDial labels. All three are text; `replace_all` of the literal is safe.
3.4. `kernel-explorer.tsx:223` — `<p className="text-center text-[10px] text-gray-400 dark:text-gray-500 font-mono">`. Single occurrence.
3.5. `hamiltonian-explorer.tsx:313` — `<p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">` (provenance footnote). Single occurrence.
3.6. `pes-explorer.tsx:423` — `<p className="mt-2 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">` (honesty note). **TARGETED edit only** — do NOT `replace_all`: lines 238 (`<line ... className="text-gray-400 dark:text-gray-500"/>`, the FCI asymptote SVG stroke) carries the identical literal and is **excluded** (see step 5). Match on the surrounding `mt-2 text-[11px] leading-relaxed ...` to disambiguate the `<p>`. (Line 290 uses `.../70` opacity — a different literal — and is not touched anyway.)
3.7. `metrics-explorer.tsx:411` — `<p className="mt-2 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">` (honesty note). Single occurrence.
3.8. `checkpoint-explorer.tsx:355/363/371/377` — three `<p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">` stat labels plus one `<p className="mt-4 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">` footnote. All four are text; `replace_all` of the literal is safe.
3.9. `vqc-trainer.tsx:264/270` — two `<p className="mt-1 text-center text-[10px] text-gray-400 dark:text-gray-500 font-mono">` chart captions. Both text; `replace_all` safe.
3.10. `vqe-explorer.tsx:318` — `<p className="mt-1 text-center text-[10px] text-gray-400 dark:text-gray-500 font-mono">` chart caption. **TARGETED edit only** — line 305 (`<line ... className="text-gray-400 dark:text-gray-500" aria-hidden="true"/>`, the floor SVG stroke) carries the identical literal and is **excluded**. Match on `mt-1 text-center text-[10px] ... font-mono` to disambiguate.

**4. Migrate the additional caption-text sites discovered by grep (same failing literal, not individually named in the WP — included so the fix is complete and the regression guard in step 6 can assert zero residual occurrences).**
4.1. `challenge.tsx:162` — `<span className="text-xs text-gray-400 dark:text-gray-500">graded with real qcsim…</span>` → `text-xs text-caption`.
4.2. `correlation-demo.tsx:145` — `<span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">{measurements} measurement…</span>` → `text-xs tabular-nums text-caption`. Do NOT touch line 69 (`text-gray-400 dark:text-gray-600` — different pair, see step 5).
4.3. `grover-visualizer.tsx:138` — inline `<span className="text-gray-400 dark:text-gray-500">success P(marked) = </span>` → `text-caption`. The sibling value span is `text-accent`, so the label still reads as a distinct, muted prefix.
4.4. `job-explorer.tsx:182` — `<span className="text-[11px] text-gray-400 dark:text-gray-500">{note}</span>` → `text-[11px] text-caption`.
4.5. `param-compile-explorer.tsx:202` — inline `<span className="ml-1 text-gray-400 dark:text-gray-500">{unitLabel}</span>` → `ml-1 text-caption`. Edge case: the parent value span (line 200) is `text-gray-500 dark:text-gray-400`; after the swap the unit suffix becomes the SAME tone as the value (the two-tier value/unit distinction collapses). This is unavoidable and acceptable — gray-500 is the lightest gray that passes AA on white, so no lighter muted tier exists; the unit stays visually separated by the `ml-1` gap and the `font-mono` value/label rhythm.
4.6. `review-card.tsx:137` (`text-xs tabular-nums text-gray-400 dark:text-gray-500`) and `:173` (`block text-[11px] text-gray-400 dark:text-gray-500 mb-1.5`) — both → swap pair to `text-caption`, keep other utilities. Both text; `replace_all` of the literal safe.
4.7. `runnable-editor.tsx:102` (`text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500` "Output" label), `:117` (`text-gray-400 dark:text-gray-500` "Booting Python…"), `:141` (`text-gray-400 dark:text-gray-500` "(no output)") — all three → swap pair to `text-caption`. All text; `replace_all` of the literal safe.
4.8. `bloch-sphere-3d.tsx:112` — `<span className="select-none font-mono text-[10px] text-gray-400 dark:text-gray-500">` (axis label inside the R3F `<Html>` overlay) → `select-none font-mono text-[10px] text-caption`. Note: this is on the WebGL/3D path, **not** covered by jsdom; verified by the source-scan guard (step 6) and manual browser check only.

**5. Explicit exclusions (do NOT modify) — record the rationale.**
5.1. SVG graphical strokes that share the literal but are non-text reference lines (governed by WCAG 1.4.11, intentionally light, changing them risks chart legibility): `pes-explorer.tsx:238` (FCI asymptote `<line>`), `pes-explorer.tsx:290` (`text-gray-400/70 dark:text-gray-500/70`, already a different literal + opacity), `vqe-explorer.tsx:305` (floor `<line>`, `aria-hidden`).
5.2. The **different** pair `text-gray-400 dark:text-gray-600` (dark side is gray-600, not gray-500 — not the target token; a separate secondary-annotation tier): `correlation-demo.tsx:69`, `shots-sampler.tsx:141`. Out of scope for this WP.
5.3. All sites already using the correct `text-gray-500 dark:text-gray-400` (the good pair — dozens, e.g. `ProbBars` in widget-ui:63/72, `noise-visualizer`, `shots-sampler`, etc.) are **not** touched; they already pass AA. A blanket consolidation of those to `.text-caption` is a larger, riskier rename and is explicitly deferred (this PR stays surgical: only the inverted, failing literal is migrated).

**6. Add a source-level regression guard test.**
6.1. Create `web/__tests__/components/quantum/caption-contrast.test.ts`. It reads component sources with `node:fs` and asserts the invariant directly (deterministic, fast, covers even the WebGL path that jsdom cannot render):
   - Assert `globals.css` contains `.text-caption` and the string `text-gray-500 dark:text-gray-400` inside it.
   - For each migrated file (the full list from steps 2–4), assert the source does **not** contain the substring `text-gray-400 dark:text-gray-500`.
   - For the two exclusion files, assert the literal still appears exactly once (`pes-explorer.tsx`, `vqe-explorer.tsx`) so an accidental over-broad `replace_all` is caught.
   Suggested signature/shape:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
const Q = join(__dirname, "../../../src/components/quantum");
const read = (f: string) => readFileSync(join(Q, f), "utf8");
const BAD = "text-gray-400 dark:text-gray-500";
const MIGRATED = ["widget-ui.tsx","dj-demo.tsx","qaoa-explorer.tsx","encoding-explorer.tsx",
  "kernel-explorer.tsx","hamiltonian-explorer.tsx","metrics-explorer.tsx",
  "checkpoint-explorer.tsx","vqc-trainer.tsx","challenge.tsx","correlation-demo.tsx",
  "grover-visualizer.tsx","job-explorer.tsx","param-compile-explorer.tsx",
  "review-card.tsx","runnable-editor.tsx","bloch-sphere-3d.tsx"];
test.each(MIGRATED)("%s has no inverted caption literal", (f) =>
  expect(read(f)).not.toContain(BAD));
test("pes/vqe keep exactly one SVG-stroke occurrence", () => {
  for (const f of ["pes-explorer.tsx","vqe-explorer.tsx"])
    expect(read(f).split(BAD).length - 1).toBe(1);
});
```
   (`pes-explorer.tsx` and `vqe-explorer.tsx` are deliberately NOT in `MIGRATED` because they each retain one excluded SVG occurrence; the second test pins that count.)
6.2. Extend one or two existing render tests to assert the rendered DOM carries the new class (catches a wrong token name in `globals.css`):
   - `web/__tests__/components/quantum/dj-demo.test.tsx`: query the footnote paragraph by its text ("One query decides it") and assert `toHaveClass("text-caption")` and `not.toHaveClass("text-gray-400")`.
   - `web/__tests__/components/quantum/checkpoint-explorer.test.tsx`: query a stat label (e.g. text "iterations saved") and assert `toHaveClass("text-caption")`.

#### File & Code Changes

| Action | File Path | Description of Change |
| --- | --- | --- |
| Modify | web/src/app/globals.css | Add `.text-caption { @apply text-gray-500 dark:text-gray-400; }` in `@layer utilities` after `.slider` (~line 293). |
| Modify | web/src/components/quantum/widget-ui.tsx | `:86` StateReadout prefix span → `text-caption`. |
| Modify | web/src/components/quantum/dj-demo.tsx | `:130` footnote `<p>` color pair → `text-caption`. |
| Modify | web/src/components/quantum/qaoa-explorer.tsx | `:322`, `:399` chart captions → `text-caption` (replace_all of literal; no SVG match). |
| Modify | web/src/components/quantum/encoding-explorer.tsx | `:118/:124/:128` BlochDial labels → `text-caption` (replace_all). |
| Modify | web/src/components/quantum/kernel-explorer.tsx | `:223` chart caption → `text-caption`. |
| Modify | web/src/components/quantum/hamiltonian-explorer.tsx | `:313` provenance footnote → `text-caption`. |
| Modify | web/src/components/quantum/pes-explorer.tsx | `:423` honesty note → `text-caption`. TARGETED edit; exclude SVG `:238`/`:290`. |
| Modify | web/src/components/quantum/metrics-explorer.tsx | `:411` honesty note → `text-caption`. |
| Modify | web/src/components/quantum/checkpoint-explorer.tsx | `:355/:363/:371/:377` stat labels + footnote → `text-caption` (replace_all). |
| Modify | web/src/components/quantum/vqc-trainer.tsx | `:264/:270` chart captions → `text-caption` (replace_all). |
| Modify | web/src/components/quantum/vqe-explorer.tsx | `:318` chart caption → `text-caption`. TARGETED edit; exclude SVG `:305`. |
| Modify | web/src/components/quantum/challenge.tsx | `:162` "graded with real qcsim" caption → `text-caption`. |
| Modify | web/src/components/quantum/correlation-demo.tsx | `:145` measurement-count caption → `text-caption`. Do NOT touch `:69` (gray-600). |
| Modify | web/src/components/quantum/grover-visualizer.tsx | `:138` "success P(marked) =" label span → `text-caption`. |
| Modify | web/src/components/quantum/job-explorer.tsx | `:182` `{note}` caption → `text-caption`. |
| Modify | web/src/components/quantum/param-compile-explorer.tsx | `:202` `{unitLabel}` suffix span → `text-caption` (two-tier collapse, acceptable). |
| Modify | web/src/components/quantum/review-card.tsx | `:137`, `:173` captions → `text-caption` (replace_all). |
| Modify | web/src/components/quantum/runnable-editor.tsx | `:102/:117/:141` Output label / boot / no-output text → `text-caption` (replace_all). |
| Modify | web/src/components/quantum/bloch-sphere-3d.tsx | `:112` R3F `<Html>` axis label → `text-caption` (WebGL path; not jsdom-covered). |
| Create | web/__tests__/components/quantum/caption-contrast.test.ts | Source-scan guard: no inverted literal in migrated files; `.text-caption` exists in globals.css; pes/vqe retain exactly one SVG occurrence. |
| Modify | web/__tests__/components/quantum/dj-demo.test.tsx | Assert footnote paragraph `toHaveClass("text-caption")`, not `text-gray-400`. |
| Modify | web/__tests__/components/quantum/checkpoint-explorer.test.tsx | Assert a stat label `toHaveClass("text-caption")`. |

#### Testing & Validation
- **New unit test** `caption-contrast.test.ts`: asserts (a) `globals.css` defines `.text-caption` containing `text-gray-500 dark:text-gray-400`; (b) each of the 17 migrated component files contains zero occurrences of `text-gray-400 dark:text-gray-500`; (c) `pes-explorer.tsx` and `vqe-explorer.tsx` each still contain exactly one occurrence (the deliberately-excluded SVG stroke). This is the primary guard and is the only coverage for the WebGL-only `bloch-sphere-3d.tsx` site.
- **Extended render tests**: `dj-demo.test.tsx` asserts the rendered footnote carries `text-caption` and not `text-gray-400`; `checkpoint-explorer.test.tsx` asserts a stat label carries `text-caption`. These confirm the class name actually lands in the DOM and is spelled correctly.
- **Verify commands** (run in `web/`): `npm run lint && npm test && npm run build`. Expect ~479 existing tests + the new ones green, 12 pages exported. `npm run build` confirms Tailwind compiles `.text-caption` (a missing/typo'd utility would surface as an unstyled class, not a build error, so the render assertion is what actually proves it resolves — but the build must still pass cleanly).
- **Manual browser verification** (`npm run dev`, port 3000):
  1. Open a lesson rendering an explorable with a footnote (e.g. the Deutsch–Jozsa page → dj-demo caption "One query decides it…"). In light mode confirm the caption is visibly darker than before (gray-500) and clearly legible; in dark mode (toggle theme) confirm it is slightly lighter (gray-400) and legible against the dark card.
  2. On a chart explorable (vqe-explorer / qaoa-explorer / kernel-explorer), confirm the axis/legend caption text darkened in light mode AND the SVG reference line (asymptote/floor) is **unchanged** (still the lighter decorative stroke) — proving the SVG exclusion held.
  3. On a `StateReadout` consumer (circuit-lab / wavefunction-scrubber), confirm the `|ψ⟩ =` prefix is legible and still subordinate to the accent-colored amplitude string.
  4. Optional: run a DevTools contrast check (or Lighthouse/axe) on a sampled caption in both themes to confirm ≥4.5:1.
- **Clean rollback**: the entire package is one squash-merged PR; `git revert <merge-sha>` removes the `.text-caption` definition and all class swaps together. Because every migrated site moved from one valid Tailwind pair to a utility that expands to another valid pair (and the guard test reverts with it), there is no partial/broken intermediate state.

#### Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Over-broad `replace_all` hits an excluded SVG stroke sharing the identical literal in `pes-explorer.tsx` / `vqe-explorer.tsx`, recoloring a chart reference line. | Med | Med | Use TARGETED edits (match surrounding `text-[11px] leading-relaxed`/`text-center text-[10px] font-mono`) for those two files only; `caption-contrast.test.ts` pins each to exactly one remaining occurrence. |
| Visual regression: captions shift tone (lighter→darker in light, darker→lighter in dark). | High (by design) | Low | Intended AA fix; body text (gray-700/800 light, gray-200 dark) remains darker/lighter than captions, so the muted tier and hierarchy are preserved. Manual two-theme browser check on representative pages. |
| a11y regression — `.text-caption` itself fails AA on a darker nested surface (e.g. `dark:bg-gray-900/40` cards). | Low | Med | gray-400 on `#0f1623`-class surfaces is ~6:1+; gray-500 on white ~4.6:1. Both above 4.5:1. Spot-check the checkpoint stat cards (which sit on `dark:bg-gray-900/40`) with a contrast tool. |
| param-compile value/unit two-tier de-emphasis collapses to one tone. | High (1 site) | Low | Unavoidable — gray-500 is the AA floor on white, so no lighter muted tier can exist; the unit stays separated by `ml-1` spacing. Documented as accepted in step 4.5. |
| Test breakage: an existing render/snapshot test asserts the old `text-gray-400` class on a migrated element. | Low | Low | No existing test asserts these specific caption classes (verified: no `toHaveClass("text-gray-400…")` on these widgets). The new assertions are additive; full suite run catches any surprise. |
| Token/cascade pitfall: defining a `--color-caption` `@theme` token instead of a class would not switch by theme (static `@theme inline`). | Low | Med | Plan mandates a utility **class** with `@apply ... dark:...` (mirrors `.focus-ring`/`.slider`), never a `@theme` color token. |
| `.text-caption` defined outside `@layer utilities` could lose specificity to a sibling color utility on the same element. | Low | Low | All migrated elements have only one color utility (the swapped one); class is placed inside `@layer utilities` so its `dark:` variant resolves identically to the inline pair it replaces. |

#### Dependencies & Order of Operations
- **Step 1 (define `.text-caption`) must land before steps 2–4** (the class must exist before any site references it) — though within a single PR the order is immaterial since they ship atomically; for incremental local verification, do step 1 first so `npm run dev` renders correctly mid-edit.
- **Steps 2–4 are mutually independent** and can be done in any order / parallelized across files; each is a self-contained class swap. Recommended sequence: 2 (widget-ui, highest leverage) → 3 (named sites) → 4 (discovered sites) → 5 (verify exclusions untouched).
- **Step 6 (tests) depends on 1–5 being complete** (the source-scan asserts the end state).
- **Relative to other WS-6x packages:** WS-6e is self-contained and introduces no new `widget-ui.tsx` React primitive (it adds a CSS utility), so it does **not** block, and is not blocked by, any "primitives-before-migrations" package (e.g. a `WidgetCard`/`LabeledSlider` introduction). It can land before or after those independently. If a sibling package also edits `globals.css` `@layer utilities`, sequence them to avoid a trivial merge conflict in that block (this PR appends one small rule near `.slider`).

#### Estimated Effort
- **Complexity:** Low (mechanical class swap + one CSS utility + a source-scan test). The only non-trivial care points are the two TARGETED-edit files (pes/vqe) and confirming the gray-600 / SVG / already-good-pair exclusions.
- **Time:** ~1.0–1.5 hours including the verify loop and two-theme browser check.
- **File count:** 23 changed — **1 create** (`caption-contrast.test.ts`), **22 modify** (1 CSS + 19 component `.tsx` + 2 existing test files), **0 delete**.


---

### WS-6f — Resilience & smaller correctness

#### Objective
Eliminate a cluster of independent resilience and correctness defects in the quantum explorables: an unbounded `setTimeout` chain that leaks past unmount (`vqe-explorer`), two functions that hang or admit non-finite/degenerate input (`periodicState`, `loadH2Curve`), a silent-identity parse hole (`CNOT control==target`), a tested-vs-shipped code-path divergence (`kernelScore`/`kernelScoreS`), a loss curve seeded from the wrong random draw (`vqc-trainer`), and four widgets that swallow malformed config instead of surfacing the shared `ErrorCard`. When done, each widget fails loudly and consistently on bad input, every shipped logic path is the one covered by tests, and no animation timer survives unmount.

#### Prerequisites
- Node toolchain already used by the repo; run everything from `web/`.
- Knowledge: React hooks rules (all hooks must run before any early return — already the pattern in these files), `useState` lazy initializers, jsdom render tests via `@testing-library/react`, and the project's `ErrorCard` primitive contract (`web/src/components/quantum/widget-ui.tsx:105` renders the literal string `"<label> error: <message>"`).
- Assumptions verified during planning: (a) the only live curriculum fences are `04-quantum-ml/GUIDE.md` (`qencode {"x":[0.6,0.9],"encoding":"angle"}`), `03-algorithms/GUIDE.md` (`qft {"qubits":4,"input":"period:4"}`), `06-hybrid-jobs/GUIDE.md` (`qjob {...finite numbers...}`), `02-hardware/GUIDE.md` (`qnoise qubits 2 / H 0 / CNOT 0 1`) — all well-formed, so the stricter parsers do not regress shipped content; (b) `periodicState` is only reached from `qft-visualizer` with an already-validated positive-integer period, so its guard is defense-in-depth; (c) `featureState` and `kernelScoreS` are exported from `kernel.ts` and importable by tests.
- Coordination: `vqe-explorer.tsx` is also edited by **WS-6a**. Keep this package's change to a single, isolated insertion (one `useEffect`) to minimize merge conflict; whichever lands second rebases the other's hunk.

#### Step-by-Step Implementation

**1. VqeExplorer — clear the optimize-animation timer on unmount** (`web/src/components/quantum/vqe-explorer.tsx`)
- 1.1 Add `useEffect` to the React import on line 3: `import { useEffect, useId, useMemo, useRef, useState } from "react";`.
- 1.2 Immediately after the `timerRef` declaration (currently line 99, `const timerRef = useRef<...>(null);`) and **before** the `model` useMemo (line 102) so all hooks still precede the early return at line 120, insert an unmount-only cleanup effect that references the stable ref directly (do **not** depend on `stopAnimation`, which is redefined every render at line 154):
  ```tsx
  // Clear any pending optimize-animation frame if the widget unmounts mid-run,
  // so the setTimeout chain can't call setTheta/setOptimizing on an unmounted tree.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
  ```
- 1.3 Leave the existing `stopAnimation` (154-159), `onOptimize` (161-196), and `onReset` (198-202) untouched — they already clear the timer on the in-component interactions; this only adds the unmount path.

**2. periodicState — reject degenerate period** (`web/src/components/quantum/qft.ts`)
- 2.1 At the top of `periodicState` (line 29, before the `for (let j = 0; j < N; j += period)` loop on line 32) add a guard so a non-positive or non-integer period throws instead of looping forever (`j += 0` never advances; `j += negative` runs away):
  ```ts
  if (!Number.isInteger(period) || period <= 0) {
    throw new RangeError("periodicState: period must be a positive integer");
  }
  ```
- 2.2 Do not change `basisState` or `qft`.

**3. QftVisualizer — surface invalid JSON and any throw via the shared ErrorCard** (`web/src/components/quantum/qft-visualizer.tsx`)
- 3.1 Rewrite the head of `parseConfig` (lines 29-37) to stop swallowing invalid JSON (`catch { raw = {} }`) while preserving the empty-source default:
  ```ts
  function parseConfig(source: string): ParseResult {
    const trimmed = source.trim();
    let raw: unknown = {};
    if (trimmed.length > 0) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        return { error: "invalid JSON" };
      }
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return { error: "expected a JSON object" };
      }
    }
    const obj = raw as Record<string, unknown>;
    // ...unchanged from the existing `const n = ...` line onward...
  }
  ```
  (Empty/whitespace source keeps `raw = {}` → defaults to `period:4`, exactly as today.)
- 3.2 Harden the `result` useMemo (lines 130-143) so a throw from `periodicState`/`qft` (step 2's guard, as defense-in-depth) renders the ErrorCard instead of crashing render — wrap the body in try/catch returning `null`; the existing fallthrough at lines 145-147 (`if (!parsed.config || !result) return <ErrorCard message={parsed.error ?? "invalid configuration"} />`) already handles `null`:
  ```ts
  const result = useMemo(() => {
    if (!parsed.config) return null;
    try {
      const { n, kind, value } = parsed.config;
      const input = kind === "basis" ? basisState(n, value) : periodicState(n, value);
      const output = qft(input);
      return { n, kind, value, inMag: input.map(mag), outMag: output.map(mag) };
    } catch {
      return null;
    }
  }, [parsed]);
  ```

**4. qsim DSL — reject degenerate CNOT (control == target)** (`web/src/components/quantum/qsim-dsl.ts`)
- 4.1 In the `CNOT` branch (lines 65-72), after `const control = c.value;` / `const target = t.value;` (lines 69-70) and before `gates.push(...)`, add:
  ```ts
  if (control === target) throw new Error("CNOT control and target must differ");
  ```
  The throw is inside the existing `try` (line 51), so it is caught at line 102 and returned as `program.error` — the #51 index-validation rejected garbage/negative indices but not equal indices, which `applyCNOT` would otherwise execute as a silent identity. This propagates to all `parseProgram` consumers (CircuitLab, WavefunctionScrubber, NoiseVisualizer).

**5. loadH2Curve — reject non-finite point fields** (`web/src/components/quantum/chemistry.ts`)
- 5.1 On line 317 change the numeric gate from `Number.isNaN(x)` (which lets `Infinity`/`-Infinity` pass — they are not NaN) to a finiteness check:
  ```ts
  if (fields.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
    throw new Error("loadH2Curve: non-finite point field");
  }
  ```
  (Message updated for honesty; the existing test only asserts `.toThrow()`, so no break.)

**6. kernel — collapse to one scoring function so tests cover the shipped path** (`web/src/components/quantum/kernel.ts`)
- 6.1 `kernelScoreS` (lines 38-43, the **shipped** path used by `kernel-explorer.tsx:142,148`) stays the single source of the scoring loop. Reimplement `kernelScore` (lines 30-35, the **tested** path used by `kernel.test.ts:20`) as a thin wrapper that precomputes the train states and delegates, so the scoring summation lives in exactly one place and the existing test flows through the shipped code:
  ```ts
  export function kernelScore(x: [number, number], train: Point[], map: FeatureMap, scale: number, bias: number): number {
    const trainStates = train.map((p) => featureState(p.x, map, scale));
    return kernelScoreS(x, trainStates, train, map, scale, bias);
  }
  ```
  Move/keep the `kernelScoreS` definition above `kernelScore` (or leave order and rely on hoisting — both are function declarations, so hoisting is fine). No call sites change; `kernel-explorer.tsx` continues to call `kernelScoreS` with its own precomputed states.

**7. VqcTrainer — seed the loss curve from the model's actual initial theta** (`web/src/components/quantum/vqc-trainer.tsx`)
- 7.1 The `theta` state (line 209) is one random `initTheta()` draw; the `history` initializer (line 212) calls a **second, independent** `initTheta()`, so the first loss-curve point belongs to a different model than the one rendered. Change line 212 to read the already-initialized `theta` and the memoized `data` (both declared above on lines 208-209), matching the already-correct `onReset` (lines 237-241):
  ```tsx
  const [history, setHistory] = useState<number[]>(() => [mseLoss(data, theta, 0)]);
  ```
  This also removes the redundant second `makeBlobs(30, 1)` call. `bias` starts at 0, so `mseLoss(data, theta, 0)` is exactly the model's initial loss. `makeBlobs` import stays (used by the `data` useMemo at line 208).

**8. NoiseVisualizer — route both error states through the shared ErrorCard** (`web/src/components/quantum/noise-visualizer.tsx`)
- 8.1 Add the import: `import { ErrorCard as SharedErrorCard } from "./widget-ui";`.
- 8.2 Replace the bespoke parse-error card (lines 79-92) with:
  ```tsx
  if (program.error) {
    return <SharedErrorCard label="qnoise" message={program.error} />;
  }
  ```
- 8.3 Replace the bespoke over-qubit-limit card (lines 95-108) with:
  ```tsx
  if (program.n > 3) {
    return <SharedErrorCard label="qnoise" message="supports up to 3 qubits" />;
  }
  ```
  This deletes ~24 lines of duplicated card markup and aligns the widget with the headerless shared card used by `qvqe`/`qjob`/`qft`/`qencode`. The valid-render branch (header + fidelity live region + bars + controls) is unchanged.

**9. EncodingExplorer — surface malformed config instead of silently defaulting** (`web/src/components/quantum/encoding-explorer.tsx`)
- 9.1 Add the import: `import { ErrorCard as SharedErrorCard } from "./widget-ui";`.
- 9.2 Convert `parseSource` (lines 43-66) from "always returns `Parsed`" to a discriminated union; empty source stays a default, genuinely malformed input becomes an error:
  ```ts
  type ParseResult = { ok: true; value: Parsed } | { ok: false; error: string };

  function parseSource(source: string): ParseResult {
    const trimmed = source.trim();
    if (trimmed.length === 0) return { ok: true, value: DEFAULTS };
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: "invalid JSON" };
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: "expected a JSON object" };
    }
    const obj = raw as Record<string, unknown>;

    let x: [number, number] = [...DEFAULTS.x];
    const rawX = obj["x"];
    if (rawX !== undefined) {
      if (
        !Array.isArray(rawX) || rawX.length < 2 ||
        typeof rawX[0] !== "number" || typeof rawX[1] !== "number" ||
        !Number.isFinite(rawX[0]) || !Number.isFinite(rawX[1])
      ) {
        return { ok: false, error: '"x" must be a two-number array' };
      }
      x = [rawX[0], rawX[1]];
    }

    const rawEnc = obj["encoding"];
    let encoding: Encoding = DEFAULTS.encoding;
    if (rawEnc !== undefined) {
      if (!isEncoding(rawEnc)) {
        return { ok: false, error: `encoding must be one of ${ENCODINGS.join(", ")}` };
      }
      encoding = rawEnc;
    }
    return { ok: true, value: { x, encoding } };
  }
  ```
  (Keeps the existing tolerance for `x.length > 2` — first two used.)
- 9.3 Update the component head (lines 75-98) to keep all hooks unconditional, then early-return the ErrorCard **after** every hook. Add a `fallback` so the `useState` initializers always have a valid `Parsed`:
  ```tsx
  const parsed = useMemo(() => parseSource(source), [source]);
  const fallback = parsed.ok ? parsed.value : DEFAULTS;

  const [x0, setX0] = useState(() => clamp(fallback.x[0]));
  const [x1, setX1] = useState(() => clamp(fallback.x[1]));
  const [encoding, setEncoding] = useState<Encoding>(fallback.encoding);
  // ...x0Id/x1Id/encId, and the state/n/norm/dirac useMemos unchanged...

  if (!parsed.ok) {
    return <SharedErrorCard label="qencode" message={parsed.error} />;
  }
  // ...existing return(...) JSX unchanged...
  ```
  Keep the local `clamp` (lines 68-69, the [-PI, PI] clamp) — it is not the parse-utils `clamp`.

**10. JobExplorer — route swallowed numeric config through the shared ErrorCard** (`web/src/components/quantum/job-explorer.tsx`)
- 10.1 The numeric fields use `numberOr` (parse-utils line 40), which silently returns the default on a present-but-non-finite/non-numeric value (`{"iterations": 1e999}` → `Infinity` → defaulted/clamped; `{"shots":"many"}` → defaulted). Switch to `readNumber` (parse-utils line 24), which returns a typed error for present-but-invalid and clamps finite values identically. Change the import on line 5 from `import { clamp, numberOr } from "./parse-utils";` to `import { readNumber } from "./parse-utils";` (both `clamp` and `numberOr` become unused).
- 10.2 Replace the `config` construction (lines 102-110) with per-field reads that surface the first error:
  ```ts
  const it = readNumber(obj, "iterations", DEFAULTS.iterations, ITER.min, ITER.max);
  if (!it.ok) return { ok: false, error: it.error };
  const sh = readNumber(obj, "shots", DEFAULTS.shots, SHOTS.min, SHOTS.max);
  if (!sh.ok) return { ok: false, error: sh.error };
  const qw = readNumber(obj, "queueWaitSec", DEFAULTS.queueWaitSec, QUEUE.min, QUEUE.max);
  if (!qw.ok) return { ok: false, error: qw.error };
  const isec = readNumber(obj, "iterSec", DEFAULTS.iterSec, ITERSEC.min, ITERSEC.max);
  if (!isec.ok) return { ok: false, error: isec.error };

  const config: Config = {
    iterations: Math.round(it.value),
    shots: Math.round(sh.value),
    provider,
    instance,
    queueWaitSec: qw.value,
    iterSec: isec.value,
  };
  return { ok: true, config };
  ```
  Finite, in/out-of-range numeric configs behave exactly as before (clamped); only present-but-non-finite/non-numeric now errors. The provider/instance validation (lines 86-100) and the post-hooks early return (`if (!parsed.ok) return <ErrorCard .../>`, lines 285-287) are unchanged.

#### File & Code Changes

| Action | File Path | Description of Change |
|---|---|---|
| Modify | web/src/components/quantum/vqe-explorer.tsx | Import `useEffect`; add unmount-only cleanup effect clearing `timerRef` (step 1). Coordinate with WS-6a. |
| Modify | web/src/components/quantum/qft.ts | Guard `periodicState` against non-positive / non-integer period (throw `RangeError`) (step 2). |
| Modify | web/src/components/quantum/qft-visualizer.tsx | `parseConfig` errors on invalid JSON / non-object (preserve empty default); wrap `result` useMemo in try/catch → `null` (step 3). |
| Modify | web/src/components/quantum/qsim-dsl.ts | Reject `CNOT` with `control === target` in the parse `try` (step 4). |
| Modify | web/src/components/quantum/chemistry.ts | `loadH2Curve` numeric gate uses `!Number.isFinite(x)` to reject Infinity/NaN; message → "non-finite point field" (step 5). |
| Modify | web/src/components/quantum/kernel.ts | Collapse `kernelScore` into a wrapper delegating to `kernelScoreS` (single shipped scoring loop) (step 6). |
| Modify | web/src/components/quantum/vqc-trainer.tsx | Seed `history` initializer from the model's own initial `theta`/memoized `data`, not a second `initTheta()` draw (step 7). |
| Modify | web/src/components/quantum/noise-visualizer.tsx | Replace two bespoke error cards with shared `ErrorCard` (`label="qnoise"`); add import (step 8). |
| Modify | web/src/components/quantum/encoding-explorer.tsx | `parseSource` → discriminated union; surface shared `ErrorCard` (`label="qencode"`) on malformed input; guard hooks; add import (step 9). |
| Modify | web/src/components/quantum/job-explorer.tsx | `numberOr`→`readNumber` for the four numeric fields so swallowed malformations surface the `ErrorCard`; swap import (step 10). |
| Modify | web/__tests__/components/quantum/qft.test.ts | Add: `periodicState` throws on period `0`, `-1`, and `1.5`. |
| Modify | web/__tests__/components/quantum/qft-visualizer.test.tsx | Add: malformed JSON renders `/qft error/i`; empty source still renders the Fourier header. |
| Modify | web/__tests__/components/quantum/qsim-dsl.test.ts | Add: `parseProgram("CNOT 0 0").error` matches `/must differ/i`, `gates` empty. |
| Modify | web/__tests__/components/quantum/chemistry.test.ts | Add: `loadH2Curve` throws on a point with `R: Infinity` (other fields finite). |
| Modify | web/__tests__/components/quantum/kernel.test.ts | Add: `kernelScore` ≡ `kernelScoreS` (with matching precomputed states) to lock the collapse; import `kernelScoreS`, `featureState`. |
| Modify | web/__tests__/components/quantum/vqc-trainer.test.tsx | Add: `Math.random` spy asserts exactly `N_PARAMS` draws at mount (one `initTheta`, not two). |
| Modify | web/__tests__/components/quantum/vqe-explorer.test.tsx | Add: fake-timers test — clicking Optimize then unmounting calls `clearTimeout`. |
| Modify | web/__tests__/components/quantum/noise-visualizer.test.tsx | Update parse-error assertion `/parse error/i` → `/qnoise error/i`; add over-limit (`n>3`) ErrorCard test. |
| Modify | web/__tests__/components/quantum/encoding-explorer.test.tsx | Add: malformed source (`"{not json"`) renders `/qencode error/i` and does not throw. |
| Modify | web/__tests__/components/quantum/job-explorer.test.tsx | Add: non-finite numeric (`'{"iterations": 1e999}'`) or non-numeric (`'{"shots":"many"}'`) renders `/qjob error/i`. |

No files are created or deleted.

#### Testing & Validation

**Unit / render tests to add or extend**
- `qft.test.ts`: `it("rejects a degenerate period", () => { expect(() => periodicState(3, 0)).toThrow(); expect(() => periodicState(3, -1)).toThrow(); expect(() => periodicState(3, 1.5)).toThrow(); })`. Asserts the infinite-loop guard.
- `qft-visualizer.test.tsx`: a test that `render(<QftVisualizer source="{not json" />)` shows `screen.getByText(/qft error/i)` and does not throw; a test that `render(<QftVisualizer source="" />)` still shows `/fourier/i` (empty-default preserved).
- `qsim-dsl.test.ts`: `it("rejects CNOT with equal control and target", () => { const p = parseProgram("CNOT 0 0"); expect(p.error).toMatch(/must differ/i); expect(p.gates).toHaveLength(0); })`.
- `chemistry.test.ts`: extend the "rejects a malformed fixture" block with `expect(() => loadH2Curve({ basis: "sto-3g", jwTerms: ["I"], points: [{ R: Infinity, c0: 0, cz: 0, cx: 0, fci: 0, hf: 0, jw: [0] }] })).toThrow();`.
- `kernel.test.ts`: `it("kernelScore matches kernelScoreS (single shipped path)", () => { const train = makeDataset("xor", 12, 3); const states = train.map((p) => featureState(p.x, "angle", 1.3)); const x: [number, number] = [0.2, -0.4]; expect(kernelScore(x, train, "angle", 1.3, 0.1)).toBeCloseTo(kernelScoreS(x, states, train, "angle", 1.3, 0.1), 12); })`. Locks that the tested fn is the shipped fn.
- `vqc-trainer.test.tsx`: `it("seeds the loss curve from the model's own initial theta (one random draw, not two)", () => { const spy = jest.spyOn(Math, "random").mockReturnValue(0.5); render(<VqcTrainer source={""} />); expect(spy).toHaveBeenCalledTimes(N_PARAMS); spy.mockRestore(); })` — import `N_PARAMS` from `@/components/quantum/vqc`. Before the fix this is `2 * N_PARAMS`; `makeBlobs` uses mulberry32, not `Math.random`, so the count is exact. (No StrictMode in RTL render → initializers run once.)
- `vqe-explorer.test.tsx`: `it("clears the pending optimize-animation timer on unmount", () => { jest.useFakeTimers(); mockMatchMedia(false); const clearSpy = jest.spyOn(global, "clearTimeout"); const { unmount } = render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />); fireEvent.click(screen.getByRole("button", { name: /optimize/i })); unmount(); expect(clearSpy).toHaveBeenCalled(); clearSpy.mockRestore(); jest.useRealTimers(); })`. The animated path (reduced-motion false) schedules the `setTimeout`, so unmount must clear it.
- `noise-visualizer.test.tsx`: change line 26 assertion to `expect(screen.getByText(/qnoise error/i)).toBeInTheDocument();`; add `it("renders the shared error card over the 3-qubit limit", () => { render(<NoiseVisualizer source={"H 0\nH 1\nH 2\nH 3"} />); expect(screen.getByText(/qnoise error/i)).toBeInTheDocument(); })` (4 qubits ≤ MAX_QUBITS so it parses, then trips the `n>3` guard). The existing fidelity live-region test is unaffected.
- `encoding-explorer.test.tsx`: `it("renders the qencode error card for malformed source", () => { expect(() => render(<EncodingExplorer source="{not json" />)).not.toThrow(); expect(screen.getByText(/qencode error/i)).toBeInTheDocument(); })`. The existing valid/empty tests still pass.
- `job-explorer.test.tsx`: `it("renders the qjob error card for a non-finite numeric field", () => { render(<JobExplorer source={'{"iterations": 1e999}'} />); expect(screen.getByText(/qjob error/i)).toBeInTheDocument(); })` (the JSON number `1e999` parses to `Infinity`).

**Exact verify commands** (from `web/`, the project's standard gate):
```
cd web && npm run lint && npm test && npm run build
```
Expect: lint clean, full Jest suite green (~479 existing + ~10 new assertions), static export = 12 pages. Optionally narrow during development: `npm test -- qft qsim-dsl chemistry kernel vqc-trainer vqe-explorer noise-visualizer encoding-explorer job-explorer qft-visualizer`.

**Manual browser verification** (`npm run dev`, port 3000; open the relevant GUIDE pages):
- Hardware module (`qnoise`): set channel to Depolarizing, drag the slider; confirm bars/fidelity update. Temporarily edit the fence body in a scratch page to `CNOT 0 0` and to `H 0 / H 1 / H 2 / H 3`; confirm each shows the headerless "qnoise error: …" card (not the old eyebrow card). Revert.
- QML module (`qvqc`): click Train a few times; confirm the loss curve's first point sits where the readout's initial `loss` was (no visible discontinuity between the seed point and the descent). Click Reset; confirm identical behavior. (`qencode`): paste `{"x":"oops"}`; confirm "qencode error: …"; restore `{"x":[0.6,0.9],"encoding":"angle"}`.
- VQE (`qvqe`): click Optimize and immediately navigate away mid-animation; confirm no React "state update on unmounted component" warning in the console.
- Algorithms (`qft`): with `{"qubits":4,"input":"period:4"}` confirm the spectrum renders; paste `{not json` confirm "qft error: invalid JSON"; clear the body entirely and confirm it still renders the default period spectrum.
- Hybrid jobs (`qjob`): confirm the default config renders both bars; paste `{"shots":"many"}` confirm "qjob error: …".

**Clean rollback**: the work is a single squash PR. `git revert <merge-commit-sha>` restores every file (all changes are Modify; no migrations, no data, no shared-primitive additions), re-running `npm run lint && npm test && npm run build` returns to the pre-PR green state.

#### Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stricter parsing breaks an existing curriculum fence (qencode/qft/qjob) | Low | Med | Audited all live `.md` GUIDE fences during planning — every one is well-formed and finite; empty-source defaults preserved in qft/encoding. Manual browser pass over the four GUIDE pages. |
| Existing `noise-visualizer.test.tsx` parse-error assertion breaks (text changes from "qsim parse error" to "qnoise error") | High (intentional) | Low | Update is in this PR (step in table); the migration is the reason for the change. |
| Visual regression on the noise error/limit state (loses the "Noise" eyebrow header) | Low | Low | Intentional alignment to the shared headerless `ErrorCard` used by all sibling widgets; happy-path render unchanged. Confirmed via manual pass. |
| a11y regression: hooks-order violation from new early returns in encoding-explorer / try-catch in qft | Low | High | All hooks (incl. the new `useEffect`, the `fallback`-seeded `useState`s) run before any early return — the established pattern in `job-explorer.tsx`/`vqe-explorer.tsx`. ESLint `react-hooks/rules-of-hooks` runs in `npm run lint`. ErrorCard text is real DOM text (screen-reader legible). |
| `vqc-trainer` seeding test is flaky if another `Math.random` call sneaks into mount | Low | Low | Verified mount path: only `initTheta` uses `Math.random` (9 calls); `makeBlobs` uses mulberry32; `mseLoss`/`vqcOutput` are deterministic. Test mocks `Math.random` and asserts exact `N_PARAMS`. |
| `vqe` unmount test flaky under fake timers / WS-6a edits | Low | Low | Uses `jest.useFakeTimers()` + `clearTimeout` spy + `jest.useRealTimers()` teardown; assertion is "called" (robust). WS-6a coordination note keeps the effect insertion isolated. |
| token/cascade pitfall: ErrorCard `className` margin differs (`my-6` vs `my-8`) | Low | Low | qft keeps its `className="my-8"` wrapper (unchanged); qnoise/qencode use the default `my-6`, matching qvqe/qvqc/qjob. No `@theme inline` tokens touched; no new utilities. |
| kernel collapse changes numeric output | Very Low | Med | Wrapper computes identical `featureState`/`fidelity` sum as before; equivalence test asserts `toBeCloseTo(..., 12)`; `kernel-explorer` keeps calling `kernelScoreS` directly. |

#### Dependencies & Order of Operations
- **Cross-package**: This package introduces **no** shared primitive — it consumes the existing `ErrorCard`. It therefore does not gate, and is not gated by, any "primitives-before-migrations" WS-6x package and can land in any order. The only cross-package coupling is the shared file `vqe-explorer.tsx` with **WS-6a**; sequence so that whichever merges second rebases the single `useEffect` hunk (no logic overlap expected).
- **Internal**: All ten steps touch independent files/symbols and can be implemented in parallel. Suggested sequence (logic first, then components, then tests, to keep each `npm test` run meaningful):
  1. Logic `.ts`: step 2 (qft), step 4 (qsim-dsl), step 5 (chemistry), step 6 (kernel).
  2. Components: step 1 (vqe-explorer), step 3 (qft-visualizer — depends on step 2's throw for the try/catch to be meaningful), step 7 (vqc-trainer), step 8 (noise-visualizer), step 9 (encoding-explorer), step 10 (job-explorer).
  3. Tests: add/extend all ten test files, then run the full `lint && test && build` gate.
- Only soft dependency: step 3 (qft-visualizer try/catch) is most meaningful after step 2 (periodicState throw); step 8's test edit must accompany step 8's code edit.

#### Estimated Effort
- **Complexity**: Med. Each fix is small and local; the breadth (10 source files + 10 test files) and the three behavior-changing parsers (qft/encoding/job) — each needing a GUIDE-audit and test update — raise it above Low.
- **Time**: ~3–4.5 hours (≈1.5h implementation, ≈1h tests, ≈0.5–1h browser verification + lint/build, ≈0.5h adversarial review/PR).
- **File count**: Create 0 / Modify 20 (10 source + 10 test) / Delete 0.


---

### WS-6g — Performance & CLS

#### Objective
Eliminate redundant per-render work and post-hydration layout shift across the heaviest explorables. When done, the VQE/QAOA/Checkpoint/Kernel widgets recompute only what an interaction actually changes (static SVG geometry, heatmap grids, base tracks, baselines, and the barren forward-kernel buffers are memoized/hoisted instead of rebuilt every tick), and the 132px→180px Bloch fallback→3D upgrade and the chunk-loading skeletons reserve their final footprint so no widget jumps after hydration. This reduces main-thread jank during slider drags / the 40-frame VQE optimize animation and removes the CLS the single 192px skeleton + size-mismatched Bloch fallback currently cause.

#### Prerequisites
- Node toolchain already set up; from `web/`: `npm run lint`, `npm test`, `npm run build` all currently green (~479 jest tests, 12-page static export).
- A real browser (Chrome) for manual verification of the 3D/WebGL and CLS paths — jsdom does **not** exercise `@react-three/fiber`/drei or measure layout, and `useWebGL()` returns `false` in jsdom (so jsdom always renders the 2D `BlochDial` fallback, which *does* make the dial-size CLS fix unit-testable).
- Familiarity with: React `useMemo`/`React.memo`, the big-endian state-vector kernel in `math.ts` (`applyGate1InPlace` already exists for private scratch buffers), and the `@theme inline` constraint (no runtime token overrides; use `dark:` utilities and existing tokens `rounded-card`, `shadow-(--shadow-resting)`, `min-h-*`).
- No new npm dependencies. No emojis in any UI string.

#### Step-by-Step Implementation

Ordering note: every new `useMemo` must be added **before** a component's early `return <ErrorCard/>` so hook order stays stable.

**1. VQE — memoize the static energy curve (`vqe-explorer.tsx`)**
The `model` memo (lines 102–118) already memoizes `samples/eMin/eMax`, but `curvePath` (lines 142–148, a 96-point string build + `.join`), the projection closures, `span`, and `floorY` are rebuilt on **every** render — including all 40 optimize frames. Fold the interaction-invariant geometry into `model`.

1.1. Inside the `model` `useMemo` (before `return { c0, cz, cx, H, floor, samples, eMin, eMax }` at line 117), also compute and return the invariant geometry:
```ts
const span = Math.max(1e-9, eMax - eMin);
const plotW = SVG.w - 2 * SVG.padX;
const plotH = SVG.h - 2 * SVG.padY;
const thetaToX = (th: number) => SVG.padX + ((th + Math.PI) / TAU) * plotW;
const energyToY = (e: number) => SVG.padY + ((e - eMin) / span) * plotH;
const curvePath = samples
  .map((s, i) => `${i === 0 ? "M" : "L"}${thetaToX(s.theta).toFixed(2)},${energyToY(s.energy).toFixed(2)}`)
  .join(" ");
const floorY = energyToY(floor);
return { c0, cz, cx, H, floor, samples, eMin, eMax, thetaToX, energyToY, curvePath, floorY };
```
1.2. After the early return, destructure the new fields from `model` and delete the now-duplicated lines 135–152 (`span`, `plotW`, `plotH`, `thetaToX`, `energyToY`, `curvePath`, `floorY`). Keep the per-render scalars `energy`, `aboveFloor`, `expZ`, `expX`, and compute only the moving marker per render: `const markerX = model.thetaToX(theta); const markerY = model.energyToY(energy);`.
1.3. Leave JSX untouched (it already references `curvePath`, `markerX`, `markerY`, `floorY`). Net effect: per optimize frame we skip the 96-iteration path rebuild; only two `O(1)` projections run.

**2. QAOA — precompute the invariant grid + memoize the graph (`qaoa-explorer.tsx`)**
The 576 heatmap `<rect>`s (RES=24, lines 289–300) and the grid-max marker (302–311) are reconciled on every gamma/beta tick; only the current-point `<circle>` (313–320) is interaction-dependent. `GraphSvg` also re-renders every tick.

2.1. Add `memo` to the React import (line 3): `import { memo, useId, useMemo, useState } from "react";`.
2.2. Wrap `GraphSvg` in `React.memo`: change its declaration to `const GraphSvg = memo(function GraphSvg({ edges, n }: { edges: Edge[]; n: number }) { ... });`. `edges` (= `parsed.edges`) and `n` are referentially stable across gamma/beta (parse is memoized on `[source]`), so the memo skips re-render on slider ticks.
2.3. Add a `heat` memo **after** the `gridMax` memo (line 229) and **before** the early return (line 250), keyed on `[landscape, gridMax]`, that builds the static cell array + the grid-max marker and folds in `span`:
```ts
const heat = useMemo(() => {
  if (!landscape || !gridMax) return null;
  const span = Math.max(1e-9, gridMax.value - gridMax.lo);
  const cells = landscape.flatMap((row, gi) =>
    row.map((v, bi) => (
      <rect key={`${gi}-${bi}`} x={bi} y={RES - 1 - gi} width={1} height={1}
        fill={heatColor((v - gridMax.lo) / span)} />
    ))
  );
  const maxMarker = (
    <rect x={gridMax.bi} y={RES - 1 - gridMax.gi} width={1} height={1} fill="none"
      stroke="currentColor" strokeWidth={0.5} className="text-amber-500 dark:text-amber-400" />
  );
  return { cells, maxMarker };
}, [landscape, gridMax]);
```
2.4. Add `heat` to the early-return guard (line 250): `if (!parsed.ok || !landscape || !gridMax || !live || !heat) { ... }`.
2.5. Delete the now-unused `span` line (260). In the heatmap `<svg>`, replace the `{landscape.map(...)}` block and the grid-max `<rect>` with `{heat.cells}` and `{heat.maxMarker}`. Keep the current `(curBi, curGi)` `<circle>` exactly as-is (the only thing that moves per tick).

**3. Barren forward kernel — reuse buffer + hoist `czEdges` (`barren.ts`)**
`czEdges(n)` (lines 6–16) is rebuilt inside every `applyCZRing` call, and `buildState` clones a fresh `2^n` array per gate via `applyGate1`/`applyCZRing`'s `.map`. For n≤8, depth≤5 a single sweep tick calls `buildState` ~`2*samples` times, each cloning ~50 arrays — thousands of allocations per tick.

3.1. Import the in-place primitive: change line 1 to `import { type Complex, ry, applyGate1InPlace, zeroState, cAbs2 } from "./math";` (drop `applyGate1`).
3.2. Memoize `czEdges` per `n` with a module-level cache (pure function of `n`, safe to cache):
```ts
const czEdgeCache = new Map<number, [number, number][]>();
function czEdges(n: number): [number, number][] {
  const hit = czEdgeCache.get(n);
  if (hit) return hit;
  const seen = new Set<string>();
  const e: [number, number][] = [];
  for (let q = 0; q < n; q++) {
    const a = q, b = (q + 1) % n;
    if (a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!seen.has(key)) { seen.add(key); e.push([a, b]); }
  }
  czEdgeCache.set(n, e);
  return e;
}
```
3.3. Make the CZ ring mutate in place (negation is applied once per qualifying index per edge, identical to the current sequential clone-and-negate, so the result is bit-for-bit unchanged):
```ts
function applyCZRingInPlace(state: Complex[], n: number): Complex[] {
  for (const [a, b] of czEdges(n)) {
    const ma = 1 << (n - 1 - a), mb = 1 << (n - 1 - b);
    for (let i = 0; i < state.length; i++) if ((i & ma) && (i & mb)) state[i] = [-state[i][0], -state[i][1]];
  }
  return state;
}
```
3.4. Rewrite `buildState` to allocate one scratch state and mutate it through every gate:
```ts
function buildState(n: number, L: number, thetas: number[]): Complex[] {
  const s = zeroState(n); // single allocation per build
  for (let q = 0; q < n; q++) applyGate1InPlace(s, ry(Math.PI / 4), q, n);
  let p = 0;
  for (let l = 0; l < L; l++) {
    for (let q = 0; q < n; q++) applyGate1InPlace(s, ry(thetas[p++]), q, n);
    applyCZRingInPlace(s, n);
  }
  return s;
}
```
`s` is a private scratch vector (never aliased — `costGlobal`/`costLocal` only read it), so in-place is correct. The RNG draw order in `gradientVariance` is unchanged, so determinism holds and `barren.test.ts` stays green.

**4. Checkpoint — precompute the static base track (`checkpoint-explorer.tsx`)**
`TimelineRow` rebuilds `iterations` base-track `<rect>`s (lines 136–146; up to 120 per row, 240 total) on every `fail`/`every` drag, though they depend only on `iterations` (→ `cellW`).

4.1. Inside `TimelineRow`, after `const cellW = ...` and before the `return`, memoize the static cells keyed on `[iterations, cellW]`:
```ts
const baseCells = useMemo(
  () => Array.from({ length: iterations }, (_, i) => (
    <rect key={i} x={i * cellW} y={4} width={Math.max(0, cellW - 0.6)} height={ROW_H}
      rx={0.8} fill="color-mix(in oklab, var(--accent) 10%, transparent)" />
  )),
  [iterations, cellW]
);
```
(`useMemo` is already imported at line 3.) Replace the inline `{Array.from({ length: iterations }, ...)}` block with `{baseCells}`. The dynamic overlay (redone region, checkpoint ticks, failure marker) stays inline — only it rebuilds on drag. Both `TimelineRow` instances pass the same stable `iterations`, so each holds its own memo across drags.

**5. Cost calculator — memoize source parse (`cost-calculator.tsx`)**
`parseSource(source)` runs on every render (line 28), including every keystroke in the shots/tasks/minutes number fields, even though `preset` only seeds initial state.

5.1. Add `useMemo` to the import (line 3): `import { useMemo, useState } from "react";`.
5.2. Change line 28 to `const preset = useMemo(() => parseSource(source), [source]);`. (Matches the `[source]` convention used by every other widget; avoids `JSON.parse` per keystroke.)

**6. Kernel — reuse train states for bias + memoize the baseline (`kernel.ts`, `kernel-explorer.tsx`)**
`kernelBias` (kernel.ts:19–28) rebuilds `train.map(featureState)` internally, then the explorer rebuilds the identical `trainStates` (kernel-explorer.tsx:133). And `nearestMeanAccuracy(train)` (the baseline) is recomputed inside the `result` memo keyed on `[train, map, deferredScale]` (line 150) though it depends only on `train`.

6.1. In `kernel.ts`, add a precomputed-states bias variant mirroring `kernelScoreS`:
```ts
/** Like kernelBias but reuses precomputed training feature states. */
export function kernelBiasS(trainStates: Complex[][], train: Point[]): number {
  let total = 0;
  for (let j = 0; j < train.length; j++) {
    let s = 0;
    for (let i = 0; i < train.length; i++) s += train[i].y * fidelity(trainStates[j], trainStates[i]);
    total += s;
  }
  return -total / train.length;
}
```
Keep `kernelBias` for its existing test/back-compat. (`Complex` is already imported in kernel.ts; `fidelity` already imported.)
6.2. In `kernel-explorer.tsx`, import `kernelBiasS` (add to the import list, lines 5–14). Inside the `result` memo (lines 128–153), build `trainStates` **first**, then derive bias from it, and drop `nearestMeanAccuracy` from this memo:
```ts
const trainStates = train.map((p) => featureState(p.x, map, deferredScale));
const bias = kernelBiasS(trainStates, train);
// ...cells + preds as before, using trainStates...
return { cells, acc }; // baseline removed
```
6.3. Add a separate baseline memo keyed only on `[train]` (after the `result` memo):
```ts
const baseline = useMemo(() => (train ? nearestMeanAccuracy(train) : 0), [train]);
```
6.4. Update the destructure (line 159) to `const { cells, acc } = result;` and read `baseline` from its own memo. JSX readout (line 237) is unchanged.

**7. drei ket labels — stop re-creating/reconciling them per Scene render (`bloch-sphere-3d.tsx`)**
The six `<Html>` labels are re-created on every `Scene` render (each slider/scrub tick changes the `state` prop → Scene re-renders), and each `<Html>` reprojects per demanded frame during drag. Memoize the label cluster so it is created once and not reconciled on state changes.

7.1. Add `memo` to the React import (line 3): `import { memo, useEffect, useMemo, useRef, useState } from "react";`.
7.2. Hoist the label data to a module-level constant and render a memoized cluster:
```ts
const KET_LABELS: { pos: [number, number, number]; text: string }[] = [
  { pos: [0, 1.3, 0], text: "|0⟩" }, { pos: [0, -1.3, 0], text: "|1⟩" },
  { pos: [1.32, 0, 0], text: "|+⟩" }, { pos: [-1.32, 0, 0], text: "|−⟩" },
  { pos: [0, 0, 1.32], text: "|i⟩" }, { pos: [0, 0, -1.32], text: "|−i⟩" },
];
const KetLabels = memo(function KetLabels() {
  return <>{KET_LABELS.map((l) => <Label key={l.text} position={l.pos}>{l.text}</Label>)}</>;
});
```
7.3. In `Scene`, replace the six inline `<Label>` JSX elements (lines 138–143) with `<KetLabels />`. Behavior is identical (decorative, `aria-hidden`); this removes per-tick React reconciliation of six Html portals. Document inline that drei `<Html>`'s per-frame DOM reprojection is inherent and out of scope (a future `drei <Text>` billboard swap is the only way to remove it, deferred to avoid a new heavy text dependency + visual regression).

**8. CLS — size the Bloch fallback to match the 3D sphere (`bloch-builder-widget.tsx`, `wavefunction-scrubber.tsx`)**
`BlochSphere3D` is `h-[180px] w-[180px] shrink-0` (bloch-sphere-3d.tsx:173); the fallback `BlochDial` defaults to 132×132 (bloch-dial.tsx:20). Pre-hydration/SSR `show3D` is `false` (server snapshot), so 132 paints, then hydration flips to the 180 sphere → ~48px layout shift.

8.1. `bloch-builder-widget.tsx` line 57: `<BlochDial state={state} />` → `<BlochDial state={state} size={180} />`. `BlochDial` scales all geometry by `k = size/132`, so 180 renders a 180×180 footprint identical to the sphere.
8.2. `wavefunction-scrubber.tsx` line 109: `<BlochDial state={current} />` → `<BlochDial state={current} size={180} />`.
8.3. Do **not** touch other `BlochDial` callers: VQE uses `size={86}` (vqe-explorer.tsx:325) and CircuitLab uses the 132 default — both intentional and unchanged.

**9. CLS — per-widget skeleton min-heights (`widget-fence.tsx`)**
The single `WidgetSkeleton` uses `min-h-48` (192px) for ~30 differently sized widgets, so the skeleton→widget swap shifts layout.

9.1. Replace the fixed skeleton/`loading` with a factory:
```ts
function WidgetSkeleton({ minH }: { minH: string }) {
  return (
    <div aria-hidden="true"
      className={`not-prose my-6 ${minH} animate-pulse rounded-card border border-gray-200/80 bg-gray-50/70 dark:border-gray-700/40 dark:bg-white/[0.02] motion-reduce:animate-none`} />
  );
}
const loadingFor = (minH: string) => function Loading() { return <WidgetSkeleton minH={minH} />; };
```
9.2. Give each `dynamic(...)` its own `loading: loadingFor("min-h-[Npx]")`. Use buckets derived from the components I read; **verify/refine each height in the browser** (measure `clientHeight` of the rendered widget at the `sm` breakpoint and round up). Starter assignments:

| Bucket | min-h | Widgets |
|---|---|---|
| compact | `min-h-[240px]` | `qcard` ReviewCard, `qcost` CostCalculator |
| medium | `min-h-[360px]` | `qkernel`, `qbarren`, `qencode`, `qjw`, `qham`, `qmetrics`, `qparam`, `qnoise`, `qtopo`, `qdj`, `qft`, `qgrover` |
| tall | `min-h-[460px]` | `qsim` CircuitLab, `qscrub`, `qbloch`, `qoptim` QAOA, `qcheckpoint`, `qpes`, `qjob`, `qvqc`, `qshots`, `qcorr`, `quiz`, `qchallenge`, `runnable`, `qdevices`, `qscrolly` |
| vqe | `min-h-[520px]` | `qvqe` VqeExplorer |

9.3. Keep the `WidgetFence` drift `<pre>` fallback unchanged. The skeleton stays `aria-hidden` with `motion-reduce:animate-none` (reduced-motion already covered).

**10. (Optional) Single-pass extent helper (`math.ts`, `barren-explorer.tsx`, `pes-explorer.tsx`)**
Replace two-pass `Math.max(...arr)/Math.min(...arr)` (which also spreads the whole array onto the call stack) with one pass.

10.1. Add to `math.ts` (after `clamp`):
```ts
/** Single-pass min/max of a non-empty numeric array. */
export function extent(arr: number[]): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v < min) min = v; if (v > max) max = v; }
  return { min, max };
}
```
10.2. `barren-explorer.tsx` lines 116–117 → `const { min: loRaw, max: hiRaw } = extent(allLogs); const loLog = Math.floor(loRaw); const hiLog = Math.ceil(hiRaw);` (import `extent` from `./math`).
10.3. `pes-explorer.tsx` lines 103–104 → `const { min: eMin, max: eMax } = extent(energies);`.
10.4. Leave `qft-visualizer.tsx`/`vqc-trainer.tsx` alone — they fold a floor seed into the spread (`Math.max(...history, 1e-9)`) and are not clean two-pass cases.

#### File & Code Changes

| Action | File Path | Description of Change |
|---|---|---|
| Modify | web/src/components/quantum/vqe-explorer.tsx | Fold invariant plot geometry (`span`, `thetaToX`, `energyToY`, `curvePath`, `floorY`) into the existing `model` `useMemo`; compute only `markerX`/`markerY` per render. |
| Modify | web/src/components/quantum/qaoa-explorer.tsx | `React.memo(GraphSvg)`; new `heat` memo (576 cells + grid-max marker + `span`) keyed on `[landscape, gridMax]`; render `{heat.cells}`/`{heat.maxMarker}`, keep only the live point marker per tick; add `memo` import and `heat` to the guard. |
| Modify | web/src/components/quantum/barren.ts | Cache `czEdges` per `n`; in-place `applyCZRingInPlace`; `buildState` uses one scratch state + `applyGate1InPlace`; import `applyGate1InPlace` instead of `applyGate1`. |
| Modify | web/src/components/quantum/checkpoint-explorer.tsx | Memoize the static base-track rects inside `TimelineRow` keyed on `[iterations, cellW]`. |
| Modify | web/src/components/quantum/cost-calculator.tsx | `useMemo(() => parseSource(source), [source])` for `preset`; add `useMemo` import. |
| Modify | web/src/components/quantum/kernel.ts | Add `kernelBiasS(trainStates, train)` reusing precomputed states. |
| Modify | web/src/components/quantum/kernel-explorer.tsx | Build `trainStates` once and feed `kernelBiasS`; move `nearestMeanAccuracy` baseline into its own memo keyed on `[train]`; `result` returns `{cells, acc}`. |
| Modify | web/src/components/quantum/bloch-sphere-3d.tsx | Hoist ket-label data to a module constant; render via memoized `<KetLabels />`; add `memo` import. |
| Modify | web/src/components/quantum/bloch-builder-widget.tsx | Pass `size={180}` to the fallback `BlochDial` (reserve the 3D sphere footprint). |
| Modify | web/src/components/quantum/wavefunction-scrubber.tsx | Pass `size={180}` to the fallback `BlochDial`. |
| Modify | web/src/components/quantum/widget-fence.tsx | Replace fixed `min-h-48` skeleton with a `loadingFor(minH)` factory; assign per-widget `min-h-[Npx]` to every `dynamic(...)`. |
| Modify | web/src/components/quantum/math.ts | (Optional) add single-pass `extent(arr)`. |
| Modify | web/src/components/quantum/barren-explorer.tsx | (Optional) use `extent(allLogs)` for `loLog`/`hiLog`. |
| Modify | web/src/components/quantum/pes-explorer.tsx | (Optional) use `extent(energies)` for `eMin`/`eMax`. |
| Modify | web/__tests__/components/quantum/kernel.test.ts | Add a `kernelBiasS` test (equals `kernelBias` for the same inputs). |
| Modify | web/__tests__/components/quantum/bloch-builder-widget.test.tsx | Assert the fallback Bloch dial renders at width/height 180. |
| Modify | web/__tests__/components/quantum/wavefunction-scrubber.test.tsx | Add an n=1 source case asserting the fallback dial is 180. |
| Modify | web/__tests__/components/quantum/checkpoint-explorer.test.tsx | Assert base-track rect count equals `iterations` per row after a `fail`/`every` change. |
| Modify | web/__tests__/components/quantum/math.test.ts | (Optional) add `extent` unit test. |

#### Testing & Validation

Unit/render tests:
- `kernel.test.ts` — add: with `train = makeDataset("circles", 60, 1)` and `trainStates = train.map((p) => featureState(p.x, "iqp", 1))`, assert `kernelBiasS(trainStates, train)` is `toBeCloseTo(kernelBias(train, "iqp", 1), 12)`. Guards the refactor's equivalence.
- `bloch-builder-widget.test.tsx` — with `mockMatchMedia(false)` (webgl is false in jsdom so the dial renders), `getByLabelText(/bloch vector/i)` and assert `getAttribute("width") === "180"` and `height === "180"`. Locks in the CLS fix.
- `wavefunction-scrubber.test.tsx` — add a case `render(<WavefunctionScrubber source="H 0" />)` (single qubit → dial path) and assert the `/bloch vector/i` svg is width 180.
- `checkpoint-explorer.test.tsx` — render with `{iterations:40,...}`, `fireEvent.change` the `fail at` slider, then assert each timeline svg still contains exactly 40 base-track `<rect>` with the `10%` accent fill (count unchanged by the memo).
- `math.test.ts` (optional) — `extent([3,-1,2])` equals `{min:-1,max:3}`; single-element and negative arrays.
- Existing `vqe-explorer.test.tsx`, `qaoa-explorer.test.tsx`, `barren.test.ts`, `cost-calculator.test.tsx`, `kernel-explorer`-adjacent tests must stay green unchanged — they assert headers/readouts/error cards and (barren) determinism + variance scaling, all behavior-preserving here.

Verify commands (from `web/`):
```
npm run lint && npm test && npm run build
```
Expect lint clean, all jest tests green (~479 + the few added), static export = 12 pages.

Manual browser verification (`npm run build` then serve `out/`, or `npm run dev`; the 3D/WebGL + CLS paths are NOT jsdom-covered):
- Open DevTools → Performance, throttle CPU 4–6×. Drag the QAOA gamma/beta sliders: confirm only the current-point marker updates (record a trace; the 576-rect heatmap and graph should not show up as re-render work each tick). Repeat for the VQE Optimize button — the 40-frame animation should be smoother, no per-frame path rebuild.
- Barren: drag the depth slider on an 8-qubit sweep; confirm responsiveness and that the two curves are visually identical to `main` (math unchanged).
- CLS: open a lesson page containing `qbloch`/`qscrub` with WebGL enabled and Performance → "Layout Shift" overlay; confirm the Bloch area does NOT jump 132→180 after hydration. Toggle prefers-reduced-motion and confirm the 180 dial renders cleanly. Hard-reload a heavy lesson and watch the skeleton→widget swap: the skeleton block should be close to the final widget height (minimal/zero CLS). Use Lighthouse to confirm CLS ≈ 0 on a widget-dense page.
- Visual diff: spot-check VQE curve, QAOA heatmap colors/markers, checkpoint timelines, kernel boundary in light and dark mode — all pixel-identical to `main`.

Rollback: this ships as one squash-merged PR. `git revert <merge_sha>` cleanly restores all touched files (pure refactors + class/string changes, no migrations, no new deps); re-run `npm run lint && npm test && npm run build` to confirm green after revert.

#### Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Barren in-place rewrite changes numerical output (scratch aliasing / negation order) | Low | High | `s` is private and read-only downstream; in-place CZ matches the original sequential clone-and-negate; `barren.test.ts` determinism + variance-scaling assertions catch any drift; cross-check one sweep against `main`. |
| VQE/QAOA geometry folded into memo produces a stale or wrong curve/heatmap | Low | Med | Memo keys (`[parsed]`/`[landscape,gridMax]`) cover every input; existing render tests + manual visual diff (light/dark) confirm pixel parity. |
| Bloch dial `size={180}` over-reserves space for reduced-motion users (bigger dial than before) | Med | Low | Intentional and consistent with the 3D footprint; verify both columns still fit the `sm:flex-row` layout in browser; only the two scrubber/builder fallbacks change (VQE 86 / CircuitLab 132 untouched). |
| Per-widget skeleton heights mis-estimated → residual CLS or excess whitespace | Med | Low | Heights are starter buckets explicitly flagged "verify in browser"; measure each widget's `clientHeight` and round up before merge; skeleton only shows briefly during chunk load. |
| a11y regression (skeleton/labels/aria) | Low | Med | Skeleton stays `aria-hidden` + `motion-reduce:animate-none`; ket labels remain `aria-hidden` decorative; no role/aria-live strings changed; run through existing render-test a11y assertions. |
| Token/cascade pitfall: `min-h-[Npx]` arbitrary values or `color-mix` token not compiled | Low | Low | Use Tailwind arbitrary `min-h-[Npx]` (JIT-safe) and reuse the existing `color-mix(in oklab, var(--accent) ...)` strings verbatim; no `@theme inline` value is overridden at runtime. |
| `React.memo(GraphSvg)` / `KetLabels` skips a needed update | Low | Low | Props (`edges`,`n`) are referentially stable across the only ticking inputs; labels are fully static (no props); confirmed by graph still re-rendering on `source` change. |
| Test breakage from new `useMemo` hook ordering | Low | Med | All new memos are added before the early `return`; lint's rules-of-hooks + jest catch ordering issues. |

#### Dependencies & Order of Operations
- This package is self-contained and does **not** depend on any primitives package (it introduces no shared `WidgetCard`/`Chip`; it only adds `kernelBiasS`/`extent` to existing logic files). It can land before or after other WS-6x packages. If a sibling package migrates these same widgets to new primitives, land that AFTER WS-6g (or coordinate) to avoid edit collisions in `vqe-explorer.tsx`/`qaoa-explorer.tsx`/`kernel-explorer.tsx`.
- Internal ordering: Steps 1–9 are mutually independent and parallelizable. Recommended sequence to keep verification incremental: do the pure-logic/memo steps first (3 barren → 6 kernel → 1 VQE → 2 QAOA → 4 checkpoint → 5 cost), run `npm test` after each cluster; then the CLS steps (8 dial sizes → 9 skeletons → 7 labels) which need browser verification; then the optional Step 10 extent helper last (math.ts before its two consumers). Step 6.1 (kernel.ts `kernelBiasS`) must precede 6.2–6.4 (its consumer). Step 10.1 (`extent`) must precede 10.2–10.3.

#### Estimated Effort
- Complexity: Medium (mostly mechanical memoization + one careful in-place kernel rewrite + breadth across ~14 files; the only subtle correctness point is barren, covered by tests).
- Time: ~4–6 hours including the manual browser CLS/perf verification and skeleton height tuning.
- File count: Create 0 / Modify 14 source files (10 core + 3 optional + 4 test files = 18 total touched; 12 if Step 10 is skipped) / Delete 0.


---

### WS-6h — Single-sourcing & consistency tail

#### Objective
Collapse the dozen-plus copy-pasted JSON-parse preambles, the three live `clamp` definitions, the duplicated H2 R-interpolation/ground-energy math, the 30 hand-written `dynamic()` option objects, and the duplicated action-button/form-control class strings down to single sources; and add shared numeric formatters so signed readouts stop rendering `-0.000` and energy/length/angle units read consistently. The result is identical rendered output across the explorables (no visual change intended) with materially less duplication, plus four small UX/a11y fixes in the hybrid-jobs widgets (F11), the cost calculator (F7), and the scrolly eyebrow (F6). The problem it solves is maintainability drift: today a change to "how we parse a fence body" or "how we color an action button" must be made in ~15 places, and several readouts can show `-0.000` or omit a unit.

#### Prerequisites
- Node toolchain already installed; run from `web/`. No new npm packages.
- Knowledge of: the fence-routing/registry contract (`widget-langs.ts` ↔ `widget-fence.tsx`, guarded by `widget-fence.test.tsx`), the big-endian state-vector conventions (irrelevant to output here but don't perturb `math.ts`), and the Tailwind v4 token set in `web/src/app/globals.css` (`rounded-control`, `rounded-chip`, `rounded-card`, `bg-accent`, `text-accent`/`text-accent-light`/`text-accent-dark`, `shadow-(--shadow-resting)`, `.slider`, `.focus-ring`, `.interactive`).
- Confirmed facts this plan relies on:
  - `clamp` is defined identically (behavior) in `math.ts:29` and `parse-utils.ts:9`; `jw-explorer.tsx:43` redefines a 3-arg `clamp`; `encoding-explorer.tsx:69` defines a 1-arg `clamp`. `bloch-dial.tsx:1` imports `clamp` from `./math`; `param-compile-explorer.tsx:7` and `job-explorer.tsx:5` import `clamp` from `./parse-utils`. `math.ts` imports nothing (so `parse-utils → math` is a safe one-way edge; `qsim-dsl.ts → parse-utils → math` has no cycle).
  - The standard parse preamble (`trim` → empty→default → `JSON.parse` catch `"invalid JSON"` → object check `"expected a JSON object"`) appears verbatim in metrics, jw, checkpoint, param-compile, hamiltonian, vqc-trainer, job, pes, vqe, kernel, qaoa. `topology-explorer.tsx:68` deliberately does NOT trim and treats empty source as an error (mandatory `topology`); `grover-visualizer.tsx`/`barren-explorer.tsx` use a `{config}|{error}` shape with custom catch messages; `cost-calculator.tsx:8` is a lenient preset parser that never error-cards. These four are intentionally out of scope.
  - `chemistry.ts` already exposes `h2OneQubit` (R-interp of c0/cz/cx, lines 330-348) and `exactGround` (217). `pes-explorer.tsx` reimplements R-interp in `curveAt` (64-78) for fci/hf and computes the tapered ground two ways vs `vqe-explorer.tsx` (`vqeEnergyAt`/`exactGround`).
  - Existing render tests query by visible text/role/aria-label, not hardcoded element ids, so `useId()` and `scope="col"` additions are safe (`device-table.test.tsx`, `cost-calculator.test.tsx`, `vqe-explorer.test.tsx`, `checkpoint-explorer.test.tsx` reviewed).

#### Step-by-Step Implementation

**Commit 1 — clamp + parse-preamble single-sourcing**

1.1 In `web/src/components/quantum/parse-utils.ts`, make `math.ts` the single home of `clamp`. Replace the local `clamp` body (lines 8-11) with a re-export and route `clampInt` through it:
```ts
import { clamp } from "./math";
export { clamp };

/** Round then clamp into [lo, hi]; NaN falls back to `lo`. */
export function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(v);
  if (Number.isNaN(n)) return lo;
  return clamp(n, lo, hi);
}
```
`readNumber` keeps calling `clamp` (now the imported one — identical behavior). Do NOT edit `math.ts`.

1.2 Add the shared JSON-object preamble to `parse-utils.ts`:
```ts
/**
 * Parse the optional JSON-object config body shared by every fenced explorable.
 * Empty/whitespace -> { ok: true, obj: null } (caller substitutes its defaults);
 * a JSON object -> { ok: true, obj }; anything else -> { ok: false, error } with
 * the standard "invalid JSON" / "expected a JSON object" messages used today.
 */
export function parseJsonObject(
  source: string
): { ok: true; obj: Record<string, unknown> | null } | { ok: false; error: string } {
  const trimmed = source.trim();
  if (trimmed.length === 0) return { ok: true, obj: null };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "expected a JSON object" };
  }
  return { ok: true, obj: raw as Record<string, unknown> };
}
```

1.3 Migrate `jw-explorer.tsx`: delete the local `clamp` (43-45); `import { clampInt, parseJsonObject } from "./parse-utils";`. Rewrite `parseSource` to:
```ts
function parseSource(source: string): ParseResult {
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) return { ok: true, config: { ...DEFAULT_CONFIG } };
  const obj = base.obj;
  // ...existing num()/rawDagger field reads unchanged...
  const modes = clampInt(rawModes, MIN_MODES, MAX_MODES);
  const electrons = clampInt(rawElectrons, 0, modes);
  const mode = clampInt(rawMode, 0, modes - 1);
  return { ok: true, config: { modes, electrons, mode, dagger } };
}
```
Replace the in-component `activeMode = clamp(mode, 0, config.modes - 1)` (line 136) with `clampInt(mode, 0, config.modes - 1)` (import already present; `mode` is already integer so result is identical).

1.4 Migrate the remaining standard-preamble explorers to `parseJsonObject`, leaving every post-`obj` field-read block byte-identical. For each: import `parseJsonObject` from `./parse-utils`, then replace the preamble lines with the `base`/`obj` pattern.
- **Early-return-on-empty form** (metrics-explorer 49-66, param-compile 42-57, hamiltonian 36-52, vqc-trainer parse, job-explorer 71-84, pes 30-44, vqe 47-61): replace down through `const obj = raw as Record<string, unknown>;` with:
  ```ts
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj === null) return /* the file's existing empty-source default */;
  const obj = base.obj;
  ```
  (e.g. vqe empty → `{ ok: true, R: H2.equilibrium.R }`; pes → `{ ok: true, mark: equilibrium }`; param-compile → `{ ok: true, config: { ...DEFAULTS } }`.) Note vqe's "no `R` key" branch (62-65) stays unchanged and still returns equilibrium for `{}`.
- **`if (trimmed.length > 0) { …parse… }` form** (kernel-explorer 40-67, qaoa-explorer 50-…, checkpoint-explorer 39-74): replace the inner block with:
  ```ts
  const base = parseJsonObject(source);
  if (!base.ok) return base;
  if (base.obj) {
    const obj = base.obj;
    // ...existing field overrides unchanged...
  }
  // ...existing post-block clamping/return unchanged...
  ```
  For checkpoint this preserves the "clamp `iterations/failAt/every` always runs" behavior (locals default → optionally overridden → clamped at 77-79). Also switch checkpoint's `clampInt` import to come alongside `parseJsonObject` from the same statement.

1.5 Out of scope (document in the PR body, do not change): `topology-explorer.tsx` (mandatory config, empty source = error), `grover-visualizer.tsx`/`barren-explorer.tsx` (`{config}|{error}` shape + bespoke catch messages), `cost-calculator.tsx` (lenient preset). Optionally also single-source `encoding-explorer.tsx:69`'s 1-arg `clamp` by deleting it and using `clamp(v, -PI, PI)` from `./parse-utils` (low value, include only if it keeps the diff clean).

**Commit 2 — chemistry single-sourcing (PES R-interp + tapered ground energy)**

2.1 In `chemistry.ts`, extract the bracket finder shared by `h2OneQubit` and a new energy interpolator, and add the analytic ground energy. After `h2OneQubit` (348):
```ts
/** Bracketing fixture segment for R and the lerp fraction t in [0,1] (clamped to ends). */
function h2Bracket(R: number, points: H2Point[]): { a: H2Point; b: H2Point; t: number } {
  const first = points[0];
  const last = points[points.length - 1];
  if (R <= first.R) return { a: first, b: first, t: 0 };
  if (R >= last.R) return { a: last, b: last, t: 0 };
  let i = 0;
  while (i < points.length - 1 && points[i + 1].R < R) i++;
  const a = points[i];
  const b = points[i + 1];
  return { a, b, t: (R - a.R) / (b.R - a.R) };
}

/** Linearly interpolate the FCI and restricted-HF energies at bond length R. */
export function h2Energies(R: number, points: H2Point[]): { fci: number; hf: number } {
  const { a, b, t } = h2Bracket(R, points);
  return { fci: a.fci + t * (b.fci - a.fci), hf: a.hf + t * (b.hf - a.hf) };
}

/** Exact ground energy of the tapered single-qubit H = c0 I + cz Z + cx X: c0 - hypot(cz, cx). */
export function oneQubitGroundEnergy(c0: number, cz: number, cx: number): number {
  return c0 - Math.hypot(cz, cx);
}
```
Refactor `h2OneQubit` (330-348) to reuse `h2Bracket` (behavior-preserving — same clamp-at-ends and same lerp):
```ts
export function h2OneQubit(R: number, points: H2Point[]): { c0: number; cz: number; cx: number } {
  const { a, b, t } = h2Bracket(R, points);
  return {
    c0: a.c0 + t * (b.c0 - a.c0),
    cz: a.cz + t * (b.cz - a.cz),
    cx: a.cx + t * (b.cx - a.cx),
  };
}
```

2.2 In `pes-explorer.tsx`: delete the local `curveAt` (64-78) and `vqeEnergyAt` (59-61); `import { h2Energies, oneQubitGroundEnergy, type H2Point } from "./chemistry";`. Replace `curveAt(mark, geom.points)` (line 160) with `h2Energies(mark, geom.points)`, and `vqeEnergyAt(p)` in the `vqeDots` map (line 124) with `oneQubitGroundEnergy(p.c0, p.cz, p.cx)`.

2.3 In `vqe-explorer.tsx`: change `floor` (line 106) from `exactGround(H).energy` to `oneQubitGroundEnergy(c0, cz, cx)` (numerically identical to ~1e-15 for the 2×2 case; keeps the 4-dp readout/floor line unchanged). Keep `H` (still used by `vqeGradientDescent` in `onOptimize`). Update the import (line 6-12): drop `exactGround`, add `oneQubitGroundEnergy`.

**Commit 3 — widget-fence dynamic() table**

3.1 In `widget-fence.tsx`, collapse the 30 repeated `{ ssr: false, loading }` objects into one factory. Add above the registry:
```ts
import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/** One lazily code-split, browser-only widget chunk (ssr:false + shared skeleton). */
function lazyWidget(
  factory: () => Promise<{ default: ComponentType<{ source: string }> }>
): SourceWidget {
  return dynamic(factory, { ssr: false, loading });
}
```
Rebuild the registry as a table; each entry resolves its named export to `{ default }` so the single options object lives only inside `lazyWidget`:
```ts
const WIDGETS: Record<string, SourceWidget> = {
  qsim: lazyWidget(() => import("./circuit-lab").then((m) => ({ default: m.CircuitLab }))),
  qscrub: lazyWidget(() => import("./wavefunction-scrubber").then((m) => ({ default: m.WavefunctionScrubber }))),
  // ...all source widgets...
  qbloch: lazyWidget(() => import("./bloch-builder-widget").then((m) => ({ default: m.BlochBuilder }))),
  qdevices: lazyWidget(() => import("./device-table").then((m) => ({ default: m.DeviceTable }))),
  // ...
};
```
For the two no-source widgets (`BlochBuilder`, `DeviceTable`) keep the source-prop drop by passing `source=""` is unnecessary — they already ignore unknown props, but to preserve the exact "ignore source" intent and the `FC<{source:string}>` signature, wrap them in the table value: `qbloch: (() => { const W = lazyWidget(...); return () => <W source="" />; })()` is over-engineered; instead keep the previous two-line pattern for just those two (`const BlochBuilder = lazyWidget(...); ... qbloch: () => <BlochBuilder source="" />`). Net: one `{ ssr:false, loading }` literal instead of 30. **Keep all 30 token keys identical** so `REGISTERED_WIDGET_LANGS` and the parity test in `widget-fence.test.tsx` stay green.

**Commit 4 — shared formatters (-0 snap + units)**

4.1 Create `web/src/components/quantum/format.ts`:
```ts
/**
 * Shared numeric formatters for the explorables' readouts and screen-reader
 * strings: centralizes -0 / sub-epsilon snapping (so a tiny negative never
 * renders as "-0.000") and the energy/length/angle unit conventions, which had
 * drifted across the chemistry and hybrid-jobs widgets.
 */
export function formatFixed(v: number, digits: number): string {
  const eps = 0.5 * Math.pow(10, -digits);
  return (Math.abs(v) < eps ? 0 : v).toFixed(digits); // Math.abs(-0) === 0 -> no "-0.000"
}
export const formatHartree = (v: number, digits = 4) => `${formatFixed(v, digits)} Ha`;
export const hartreeSR   = (v: number, digits = 4) => `${formatFixed(v, digits)} hartree`;
export const formatAngstrom = (v: number, digits = 2) => `${formatFixed(v, digits)} \u00C5`;
export const angstromSR  = (v: number, digits = 2) => `${formatFixed(v, digits)} angstrom`;
export const formatRadians = (v: number, digits = 2) => `${formatFixed(v, digits)} rad`;
```
Leave `state-readout.ts` untouched (its `formatAmplitude` snap uses a different `DISPLAY_EPS` semantics; not worth perturbing amplitude output).

4.2 Adopt surgically where a signed value can round to `-0` or a unit is missing/precision diverges:
- `vqe-explorer.tsx`: `expZ`/`expX` readout (327-330) → `formatFixed(expZ, 3)`/`formatFixed(expX, 3)` (kills `-0.000` near θ=±π); gap line (343) `gap {aboveFloor.toFixed(4)} Ha` → `gap {formatHartree(aboveFloor)}`; **visible θ readout (372-374)** `{theta.toFixed(2)}` → `{formatRadians(theta)}` and widen that span `w-14` → `w-20` to fit " rad"; in `curveAria` (204-210) replace `aboveFloor.toFixed(4)` with `formatFixed(aboveFloor, 4)`.
- `pes-explorer.tsx`: gap readout (386) → `formatHartree(readout.gap)`; in `plotAria` (174-181) bump the three `toFixed(3)` (fci/hf/gap) to match the visible 4-dp via `hartreeSR(...)`/`formatFixed(...,4)` so screen-reader precision equals the visible precision.
- `metrics-explorer.tsx`: energy readout (372) → `formatHartree(lastEnergy)`; in `streamStatus`/`plotAria` (217, 225) use `hartreeSR(lastEnergy)`/`formatFixed` so a near-zero never reads `-0.0000`.

These are display-only and preserve digit counts that tests assert (no test asserts an exact `-0`).

**Commit 5 — shared action-button + form-control tokens**

5.1 In `widget-ui.tsx`, export the two duplicated action-button class strings (verified byte-identical across `metrics:388`, `vqc-trainer:298`, `vqe:382` for primary, and the secondary across metrics/vqc/hamiltonian/vqe). Add:
```ts
/** Primary (filled-accent) action button, e.g. Optimize / Stream / Train. */
export const primaryActionClass =
  "rounded-control bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-(--shadow-resting) hover:bg-accent-dark focus-ring transition-colors motion-reduce:transition-none disabled:opacity-60";
/** Secondary (outlined) action button, e.g. Reset. */
export const secondaryActionClass =
  "rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus-ring transition-colors motion-reduce:transition-none";
/** Shared select/number-input field treatment (one canonical bg/border). */
export const fieldClass =
  "rounded-control border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus-ring";
```
Before replacing, diff each call site's string against the constant; if any differs by a class, normalize to the constant (intended: `metrics` Stream gains `disabled:opacity-60`; the inert `disabled:` on never-disabled buttons is a no-op).

5.2 Replace the primary/secondary class strings with the constants (template-string where extra classes are appended) in `vqe-explorer.tsx` (382, 389), `metrics-explorer.tsx` (388, 395 — and add `disabled={streaming}` here per Commit 6), `vqc-trainer.tsx` (298 + its Reset), `hamiltonian-explorer.tsx` (its primary/secondary). Leave `jw-explorer`'s toggle buttons alone (different `aria-pressed` toggle styling, not an action button).

5.3 Adopt `fieldClass` for the form controls flagged in F7 and the device picker: `cost-calculator.tsx` select+inputs (95, 121, 142, 162) and `device-table.tsx` select (51). (Optionally `job-explorer.tsx`'s two selects 410/432 — include only if the string matches, else leave to a follow-up.) This collapses the three divergent bg/border treatments to one canonical `bg-white dark:bg-gray-900`.

**Commit 6 — F11 UX (metrics idle, Stream busy, checkpoint labels, param-compile columns)**

6.1 `metrics-explorer.tsx` idle state. Introduce `const started = shown > 0;` and replace the header chip (241-249) three-way:
```ts
const phase = streaming ? "running" : started ? (belowThreshold ? "met" : "stopped") : "ready";
```
Render: `ready`/`stopped` → neutral chip (`rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300` with text "ready"/"stopped"), `running` → existing amber chip, `met` → existing emerald chip with text "stopping_condition met". This removes the "running over a blank chart" lie. Add a faint full-curve preview so the chart is not blank at idle: compute `const previewPath = history.map((e,i) => \`${i===0?"M":"L"}${sx(i).toFixed(2)},${sy(e).toFixed(2)}\`).join(" ");` and render it only when `!started`, as a `<path>` with `className="text-gray-300 dark:text-gray-700"` `strokeDasharray="3 4"` `strokeWidth={1.2}` `fill="none"` `aria-hidden`. Update `plotAria`'s "No iterations streamed yet." branch to read "Not started; the full curve is previewed."

6.2 `metrics-explorer.tsx` Stream busy state. The button already has `aria-busy={streaming}` (387); make the swallow visible: add `disabled={streaming}` and change the label to `{streaming ? "Streaming…" : "Stream"}`. With `primaryActionClass` (Commit 5) it now carries `disabled:opacity-60`, matching vqe's Optimize. (The `onStream` re-click guard at 158 stays as defense-in-depth.)

6.3 `checkpoint-explorer.tsx` timeline jargon. Remove the tiny in-SVG `<text>{label}</text>` (190-198) and the `label` prop from `TimelineRow` (and its two call-site props "restart redoes 0..fail" / "restart redoes lastCheckpoint..fail" at 274/290). The existing `<p>` captions above each row ("No checkpoint" / "Checkpoint every {clampedEvery}") already title them, and the `ariaLabel` already carries the full description — so this drops the overlapping camelCase text with no information loss. No test asserts that text (verified).

6.4 `param-compile-explorer.tsx` column alignment. Unify the label/value column widths so the time bars and slider rows align: `TimeBar` label span (113) `w-40` and `SliderRow` label (184) `w-32` → both `w-40`; `TimeBar` value span (144) `w-16` and `SliderRow` value (200) `w-20` → both `w-20 text-right`. Right edges of the numeric columns then line up across both sections.

**Commit 7 — F7/F6 token + a11y nits**

7.1 `cost-calculator.tsx` currency clarity (preserve the "total is the sole `/\$X\.XX/`" invariant — do NOT prefix `$` on line values). Add a `<thead>` to the breakdown table (before `<tbody>` at 171) labeling the value column, so the unitless `toFixed(4)` numbers read as USD:
```tsx
<thead>
  <tr className="border-b border-gray-100 dark:border-gray-700/40">
    <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Item</th>
    <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">USD</th>
  </tr>
</thead>
```
This adds the currency unit without introducing a second `$X.XX` match (keeps `cost-calculator.test.tsx`'s `getByText(/\$10\.30/)` unique).

7.2 `cost-calculator.tsx` ids → `useId`. Add `const deviceId = useId(); const tasksId = useId(); const shotsId = useId(); const minutesId = useId();` (import `useId`) and swap the hardcoded `htmlFor`/`id` pairs `"qcost-device"|"qcost-tasks"|"qcost-shots"|"qcost-minutes"`. Keep each control's `aria-label` so `getByLabelText(/device/i)` keeps matching.

7.3 `device-table.tsx`: id → `useId` (`const techId = useId();` import `useId`; swap `"device-tech-filter"` at 41/48). Add `scope="col"` to all seven `<th>` (71, 84, 97, 100, 113, 116, 119) so each header announces as a column header. Keep `aria-sort`/`whitespace-nowrap` etc.

7.4 `scrolly-section.tsx` eyebrow consistency (F6): change `text-accent-dark` → `text-accent` on the two eyebrow spans (43 in `StaticBeats`, 107 in `Explorable`) so the eyebrow matches the `text-accent dark:text-accent-light` used by the explorer family. (Leave `challenge`/`review-card`/`quiz`/`runnable-editor`, which are a separate "card" family also on `text-accent-dark`, untouched — only the scrolly eyebrow is flagged.)

#### File & Code Changes

| Action | File Path | Description of Change |
|---|---|---|
| Modify | web/src/components/quantum/parse-utils.ts | Re-export `clamp` from `./math` (single source); `clampInt` routes through it; add `parseJsonObject` shared preamble. |
| Modify | web/src/components/quantum/chemistry.ts | Add `h2Bracket` (private), `h2Energies`, `oneQubitGroundEnergy`; refactor `h2OneQubit` to reuse `h2Bracket` (behavior-preserving). |
| Create | web/src/components/quantum/format.ts | `formatFixed` (-0/sub-eps snap) + `formatHartree`/`hartreeSR`/`formatAngstrom`/`angstromSR`/`formatRadians`. |
| Modify | web/src/components/quantum/widget-ui.tsx | Export `primaryActionClass`, `secondaryActionClass`, `fieldClass`. |
| Modify | web/src/components/quantum/widget-fence.tsx | `lazyWidget` factory + table-built `WIDGETS`; one `{ssr:false,loading}` instead of 30. Keys unchanged. |
| Modify | web/src/components/quantum/jw-explorer.tsx | Delete local `clamp`; use `clampInt`/`parseJsonObject`; eyebrow already correct. |
| Modify | web/src/components/quantum/metrics-explorer.tsx | `parseJsonObject`; three-state status chip + faint idle preview curve; Stream `disabled`+"Streaming…"; shared button classes; `formatHartree`/`hartreeSR`. |
| Modify | web/src/components/quantum/checkpoint-explorer.tsx | `parseJsonObject` (+`clampInt` import merge); remove in-SVG `label` text/prop (overlap + camelCase jargon). |
| Modify | web/src/components/quantum/param-compile-explorer.tsx | `parseJsonObject`; unify label `w-40` / value `w-20` columns across `TimeBar`+`SliderRow`. |
| Modify | web/src/components/quantum/hamiltonian-explorer.tsx | `parseJsonObject`; adopt shared primary/secondary button classes. |
| Modify | web/src/components/quantum/vqc-trainer.tsx | `parseJsonObject`; adopt shared primary/secondary button classes. |
| Modify | web/src/components/quantum/job-explorer.tsx | `parseJsonObject` (keeps `clamp`/`numberOr` imports); optional `fieldClass` on selects. |
| Modify | web/src/components/quantum/pes-explorer.tsx | `parseJsonObject`; delete `curveAt`/`vqeEnergyAt`, use `h2Energies`/`oneQubitGroundEnergy`; `formatHartree`/`hartreeSR` + SR precision align. |
| Modify | web/src/components/quantum/vqe-explorer.tsx | `parseJsonObject`; `floor` via `oneQubitGroundEnergy` (drop `exactGround`); shared button classes; `formatRadians`(θ, widen `w-14`→`w-20`)/`formatFixed`/`formatHartree`. |
| Modify | web/src/components/quantum/kernel-explorer.tsx | `parseJsonObject` (the `trimmed.length>0` form). |
| Modify | web/src/components/quantum/qaoa-explorer.tsx | `parseJsonObject` (the `trimmed.length>0` form). |
| Modify | web/src/components/quantum/cost-calculator.tsx | `useId` for control ids; breakdown `<thead>` Item/USD (scope="col"); `fieldClass` on select+inputs. |
| Modify | web/src/components/quantum/device-table.tsx | `useId` for the technology filter; `scope="col"` on all 7 `<th>`; `fieldClass` on select. |
| Modify | web/src/components/quantum/scrolly-section.tsx | Eyebrow `text-accent-dark` → `text-accent` (2 spans) to match siblings. |
| Modify (optional) | web/src/components/quantum/encoding-explorer.tsx | Delete 1-arg local `clamp`; use `clamp(v,-PI,PI)` from `./parse-utils`. |
| Create | web/__tests__/components/quantum/parse-utils.test.ts | Unit tests for `clamp`/`clampInt`/`parseJsonObject`. |
| Create | web/__tests__/components/quantum/format.test.ts | Unit tests for `formatFixed` (-0 snap) and unit helpers. |
| Modify | web/__tests__/components/quantum/chemistry.test.ts | Add `h2Energies`/`oneQubitGroundEnergy` cases; assert `h2OneQubit` unchanged. |
| Modify | web/__tests__/components/quantum/metrics-explorer.test.tsx | Assert idle chip text ("ready", not "running") and Stream `disabled` while streaming. |
| Modify | web/__tests__/components/quantum/cost-calculator.test.tsx | Assert "USD" header present and total still uniquely `/\$10\.30/`. |

#### Testing & Validation

- **New unit tests.**
  - `parse-utils.test.ts`: `clamp(5,0,3)===3`, `clamp(-1,0,3)===0`; `clampInt(2.6,0,10)===3`, `clampInt(NaN,2,9)===2`, `clampInt(100,0,10)===10`; `parseJsonObject("")` → `{ok:true,obj:null}`, `parseJsonObject("   ")` → null obj, `parseJsonObject("{not json")` → `{ok:false,error:"invalid JSON"}`, `parseJsonObject("[1,2]")`/`"5"`/`"null"` → `{ok:false,error:"expected a JSON object"}`, `parseJsonObject('{"a":1}')` → `{ok:true,obj:{a:1}}`.
  - `format.test.ts`: `formatFixed(-0,3)==="0.000"`, `formatFixed(-1e-9,4)==="0.0000"`, `formatFixed(-1.13726,4)==="-1.1373"`; `formatHartree(-1.1)==="-1.1000 Ha"`, `formatRadians(0.4)==="0.40 rad"`, `formatAngstrom(0.74)` contains `"\u00C5"`, `angstromSR(0.74)==="0.74 angstrom"`.
  - `chemistry.test.ts`: `oneQubitGroundEnergy(c0,cz,cx)` equals `exactGround(oneQubitHamiltonian(c0,cz,cx)).energy` within `1e-9` for a couple of fixture points; `h2Energies(R)` equals the old inline lerp at an interior R and clamps at the ends; `h2OneQubit` outputs unchanged at a sampled R (regression guard for the `h2Bracket` extraction).
- **Extended render tests.** `metrics-explorer.test.tsx`: after empty-source render, `getByText("ready")` is present and `getByText("running")` is absent; the existing y-extent test still passes. `cost-calculator.test.tsx`: `getByText("USD")` present; `getByText(/\$10\.30/)` still unique. Keep all existing render tests (they query by visible text/role/aria-label, unaffected by `useId`/`scope`).
- **Verify commands** (from `web/`): `npm run lint && npm test && npm run build`. Expect ~479 jest tests + the new ones green, and the static export to emit 12 pages. The `widget-fence.test.tsx` parity test must stay green (proves the table refactor kept every token key).
- **Manual browser verification** (`npm run dev`): on a hybrid-jobs lesson, the `qmetrics` widget on first paint shows a neutral "ready" chip with a faint dashed preview curve (no "running" over a blank chart); clicking Stream disables the button, flips the label to "Streaming…", and the chip turns amber then emerald "stopping_condition met". `qcheckpoint`: the two timelines no longer show overlapping "restart redoes…" micro-text. `qparam`: the time-bar numbers and slider value numbers right-align in one column. On a VQE lesson, the `qvqe` θ readout shows "0.40 rad"; drag θ to ±π and confirm `⟨X⟩`/`⟨Z⟩` and the gap never render "-0.000". `qcost`: the breakdown shows an "Item / USD" header; total is the only `$X.XX`. `qdevices`: tab into the table — headers announce as column headers (screen reader). A `qscrolly` section's eyebrow color now matches neighboring explorer eyebrows. Toggle dark mode on each to confirm no token regressions.
- **Rollback.** All changes are one squash-merged PR; `git revert <merge-sha>` restores every file (new `format.ts`/test files are deleted by the revert). No data/store/CFN state involved, so revert is complete and side-effect-free; re-run `npm run build` to confirm.

#### Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Visual regression from button/field token unification (a call-site string differed) | Med | Med | Diff each call site against the constant before swapping; only constants that are byte-identical are substituted; `npm run build` + dark/light browser pass on vqe/metrics/cost/device. |
| Parse-preamble migration changes behavior for empty/`{}`/error inputs | Med | High | `parseJsonObject` reproduces the two error strings verbatim; per-file empty-source default preserved explicitly; topology/grover/barren/cost-calculator excluded with rationale; existing error-card render tests + new parse-utils unit tests guard. |
| `h2Bracket` extraction subtly alters `h2OneQubit`/PES interpolation at boundaries | Low | Med | Bracket logic copied 1:1 (same `<=`/`>=` end-clamp, same `while` scan); regression test asserts `h2OneQubit` unchanged and `h2Energies` matches the old inline lerp. |
| `floor` via closed form vs `exactGround` differs at 4-dp | Low | Low | For a 2×2 Hermitian the eigenvalue is exact; chemistry test asserts equality within `1e-9`; rendering uses 4-dp. |
| `formatFixed` snap hides a genuinely small negative | Low | Low | Epsilon is half-a-ulp at the chosen digit count, i.e. exactly the value that would already round to 0.000 — only `-0.000`/round-to-zero noise is affected; values that round to a nonzero magnitude are untouched. |
| a11y regression from `scope="col"`/`useId`/idle-chip wording | Low | Med | `scope="col"` and `useId` are additive; `getByLabelText`/`getByRole` unaffected (aria-labels retained); idle chip change adds a render-test assertion. |
| widget-fence table refactor drops/renames a token | Low | High | Keep all 30 keys identical; the `widget-fence.test.tsx` parity test (`REGISTERED_WIDGET_LANGS` ↔ `WIDGET_LANGS`) fails loudly on any drift. |
| Tailwind `@theme inline` token mismatch (e.g. `text-accent-dark` not defined for the new usage) | Low | Low | Only switching to already-used tokens (`text-accent`, `bg-white dark:bg-gray-900`, `rounded-control`, `focus-ring`); no new tokens introduced. |
| `cost-calculator` USD header introduces a second `$X.XX` match | Low | Med | Header text is "USD" (no `$`); line values stay `$`-less per the existing invariant; test asserts total uniqueness. |

#### Dependencies & Order of Operations

- Primitives must land before their consumers, within the PR: Commit 1 (parse-utils `clamp`/`parseJsonObject`) → all explorer parse migrations; Commit 2 (chemistry helpers) → pes/vqe; Commit 4 (`format.ts`) → vqe/pes/metrics adoption; Commit 5 (`widget-ui` button/field constants) → vqe/metrics/vqc/hamiltonian/cost/device adoption. Commit 6 depends on Commit 5 (metrics/param-compile already migrated) and Commit 1 (metrics/checkpoint/param-compile parse). Commit 3 (widget-fence) and Commit 7's scrolly/device/cost a11y nits are independent and can be done in any order.
- Suggested internal sequence: 1 → 2 → 3 → 4 → 5 → 6 → 7, each commit independently passing `lint + test + build`.
- Parallelizable: Commit 3 (widget-fence), Commit 7.4 (scrolly eyebrow), and the chemistry work (Commit 2) touch disjoint files and can be authored in parallel before the formatting/button adoptions.
- Cross-package ordering: WS-6h is self-contained — it creates its own shared primitives (`parseJsonObject`, `format.ts`, `primaryActionClass`/`secondaryActionClass`/`fieldClass`) rather than depending on a separate "primitives" WS. If a sibling WS-6x package also introduces shared button/field/Card primitives in `widget-ui.tsx`, land that first and rebase WS-6h onto it to avoid duplicate exports; otherwise WS-6h has no hard ordering dependency on other WS-6x packages and should land after any in-flight package that edits the same explorer files (notably anything touching vqe/pes/metrics) to minimize merge conflicts.

#### Estimated Effort
- Complexity: **Medium** (low conceptual risk; breadth is the cost — ~22 files, all mechanical/behavior-preserving except the four small F11/F7/F6 UX changes).
- Time: **4–6 hours** including writing the new unit tests and the browser pass.
- File count: **Create 4** (`format.ts`, `parse-utils.test.ts`, `format.test.ts`, plus the chemistry/metrics/cost test edits are modifications) → strictly: **Create 3 source/test files**, **Modify ~22**, **Delete 0** (the optional `encoding-explorer.tsx` change would make it ~23 modified).


---

## MISSION BRIEF

**Overview:** The 59 audit findings for Features 6-12 are grouped into 8 work packages (WS-6a..6h), each a single reviewable PR. Total scope ≈ **24-36 engineering hours across 8-9 PRs** (WS-6c is best split into two). Three packages fix genuine teaching/output-correctness bugs; the rest are a11y, reuse, perf, and consistency refinements the prior WS-1..5d campaign did not reach.

**Per-package effort:**

| Pkg | Theme | Complexity | Time | Files |
|-----|-------|-----------|------|-------|
| WS-6a | Correctness bugs (VQE flip, JW phantom-Z, Dirac sign) | Low | 1.5-2.5h | 6 |
| WS-6b | LiveStatus a11y sweep (11 widgets) | Low-Med | 2-3h | ~24 |
| WS-6c | Shell + slider primitives (2 PRs) | High | 6-9h | ~24 |
| WS-6d | Finish ProbBars consolidation | Low-Med | 1.5-2.5h | ~10 |
| WS-6e | Caption contrast (WCAG AA) | Low | 1-1.5h | ~23 |
| WS-6f | Resilience & smaller correctness | Med | 3-4.5h | 20 |
| WS-6g | Performance & CLS | Med | 4-6h | ~18 |
| WS-6h | Single-sourcing & consistency tail | Med | 4-6h | ~25 |

**Recommended execution order** (value-early, conflict-minimizing):

1. **WS-6a — Correctness bugs.** Highest value, smallest blast radius, zero cross-package coupling beyond sharing `vqe-explorer.tsx`. Ship first and standalone.
2. **WS-6e — Caption contrast.** Mechanical token swap behind a new `.text-caption` utility; quick AA win. Low conflict (className-only).
3. **WS-6b — LiveStatus a11y sweep.** High a11y value; mostly additive (an sr-only status line per widget) plus one new primitive.
4. **WS-6f — Resilience** and **WS-6g — Performance & CLS.** Mostly `.ts` logic-layer + memoization changes; low JSX-conflict. Can run in parallel with each other.
5. **WS-6d — ProbBars**, then **WS-6c — Shell + slider primitives** (PR-A shell, then PR-B slider). The structural refactors land **last** so they migrate the final widget JSX once, absorbing the additions from steps 2-4 rather than being invalidated by them.
6. **WS-6h — Consistency tail.** Naturally follows the refactors (shared formatters/button tokens build on the primitives).

**Decision points (resolve before/at implementation):**
- **WS-6c PR split:** ship shell primitives (WidgetCard/EyebrowLabel/Chip) and `LabeledSlider` as **two PRs** (recommended) — PR-A first so PR-B branches off a clean main. Also decide migration breadth: do the full ~28-widget sweep, or land the primitives + high-payoff sites (`noise-visualizer` ×3) first and migrate the rest incrementally.
- **WS-6e approach:** a single shared `.text-caption` utility (recommended) vs. a per-file `text-gray-500 dark:text-gray-400` swap. The utility defines the AA-passing color once.
- **WS-6d migration depth:** `noise-visualizer` stays un-migrated (variant geometry); `qft` MagnitudeBars migrates only if motion-class equivalence holds — both pre-resolved in the plan.
- **Shared-file coordination:** `vqe-explorer.tsx` is touched by WS-6a, WS-6b, WS-6f, and WS-6g; `qaoa-explorer.tsx`/`kernel-explorer.tsx` by WS-6b/WS-6d/WS-6g. Whichever PR merges second rebases a small, non-overlapping hunk — no logic conflict expected, but land them in the order above to keep rebases trivial.

**Verification gate (every PR):** `cd web && npm run lint && npm test && npm run build`, then manual browser check of the affected widgets (the 2D widgets are jsdom-covered; the WebGL/3D + CLS paths in WS-6g require manual verification), optional adversarial-review workflow over the diff, squash-merge when the 3 CI checks are green.
