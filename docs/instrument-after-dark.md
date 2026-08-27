# The Instrument, after dark — design-system application

**Date:** 2026-08-23 · **Branch:** `feat/instrument-after-dark` · **Scope:** the whole product (`web/`), brand assets, guard tests, design-sync inputs.

The commissioned design system ("Quantum Learner Design System", delivered via the claude.ai design project *Logo review and iteration*) re-grounds the product's existing Instrument language — smoke-and-glass surfaces, signal-not-surface accent, Sora + Geist type — in a new brand palette: **racing green, gold, oxblood, abyss, silver**. This document records how the entirety of that system was applied.

## The palette, in one table

| Role | Light "daylight" | Dark "after-dark" (primary) |
|---|---|---|
| Accent (gold signal) | `#A38560`, resting text pairs down to `#6F5636` | `#C2A379`, light step `#D8C29E` |
| Ground | `#E9E9E7` → `#DEDEDC` | `#071710` → `#03110D` |
| Cards | `#F4F4F2` / `#ECECEA` | `#12261F` / `#0C1D17` |
| Ink / muted | `#10231D` / `#48584F` | `#E0E0E0` / `#93A198` |
| Caution (oxblood) | `#8E4E63` (text `#652038`) | `#B37387` (text `#CDA0AE`) |
| Success / danger | `#2C7A57` / `#A93A48` | `#4FA37E` / `#C25562` |
| Primary CTA | green-black `#10231D` fill | silver `#E8E6E0` fill |
| The abyss | `#03110D` — pinned identical in both themes | same value, by cascade |

Signature rules carried through mechanically: **gold is a signal, never a button** (the contrast-guard grep now enforces the new system's own doctrine); the primary CTA stays the neutral `.surface-accent`; magnitude data rides ONE bronze→gold ramp; relative phase is hue-free.

## What changed

### Token layer (`web/src/app/globals.css`)

- Both theme blocks rewritten to the design system's exact hex anchors. `warm`/`success`/`danger` moved from theme-invariant literals to per-theme runtime vars (the same indirection `--accent` already used), so the caution tier lifts lighter on the dark ground.
- `--color-smoke: #0b0b0c` renamed to `--color-abyss: #03110D` — every `bg-smoke` consumer renamed, including the two rgba literals that had escaped the token (hero legibility wash, account-band glow).
- **Net-new:** the hue-free phase scale `--phase-0…--phase-7` (silver lightness steps, gold marks zero phase only, symmetric so θ and 2π−θ share a value) — adopted first by the Hamiltonian explorer's negative-coefficient bars (sign IS phase π).
- **Net-new:** the `.eyebrow` recipe family (Geist Mono 10px, 0.2em tracked caps, weight 500, gold pair) plus `.eyebrow-mut` (muted stat/field labels) and `.eyebrow-warm`. It replaced ~30 inline re-typings across five drifted dialects (sans 14px, mono 14px, 0.68rem/0.13em panel headers, faux-bold 10px variants…).
- Tailwind's stock blue-tinted `gray-*` ladder overridden in `@theme` with the identical lightness steps rotated to the green-silver axis (hue 168) — ~350 usages retinted in one move with every contrast relationship preserved.
- The magnitude ramp split into `--bar-fill-a/b` endpoints + composed gradient; `.chip-selected` re-inked with `#0A1812` (7.6:1 AAA on dark gold); inline-code chip lightness retuned 0.47 → 0.45 for the darker daylight ground; section identity hues `[192, 290, 75, 160, 15, 230]` kept, orthogonal to gold.

### Brand

- **The |Q⟩ dial-Q mark ships everywhere the atom was**: inline `LogoMark` component (commissioned tones as literals — the mark must not drift if the UI accent is retuned) in the nav and leading the auth form; new `favicon.ico` / `icon.png` / `apple-icon.png` (full-bleed for iOS) rendered from `app-icon.svg`; the JupyterLite `brand-favicon.ico` twin overwritten; the four SVG brand files added under `web/public/`.
- **`og.jpg` regenerated** (1200×630): the |Q⟩ mark and mono domain replace the old lightning chip, gold eyebrow, silver Sora-light headline, fog on the abyss. Same path — three metadata suites pin it.
- **Welcome photography regraded**: the teal-graded renders (Bloch sphere, circuit traces, dilution refrigerator) hue-remapped into jade green with golds preserved; alt text updated to match the pixels. The hero fog is neutral and stays.
- The Founding Ten charter badge is an issued credential and stays as struck.

### The instrument-face hero

The welcome hero was rebuilt to the design system's web UI kit (`ui_kits/web/Welcome.jsx`): a colossal **dial** rises from below the fold with the curriculum engraved as its bezel — hairline rim circles, machined tick marks, stations 00–06, and the gold hand from the |Q⟩ mark resting on "Start here · 00 Prerequisites". HUD corner registration marks and telemetry lines frame the face; a mono kicker with a blinking caret leads the headline, which now sets **"from |0⟩ to production"** with the ket in gold mono (the copy the kit designed; both locales updated, and the OG card re-shot to speak the same line). The old constellation nodes, CountUp stat row, horizons meter, and scroll cue retired with it. The dial is now a working instrument: selecting a bezel station sweeps the gold needle to it (a CSS rotation on the hand group — reduced motion collapses the sweep to a jump) and opens a blurb card in the dial face carrying the module's manifest-derived summary and notebook count, with the one real link into the section; stations expose `aria-expanded`, the blurb takes focus on open, and Escape hands it back. The "Free · In-browser · No install" micro-row clears the bezel at every viewport via width-proportional padding (the crest sits at ~12.5% of the frame width above its bottom edge, so a fixed value could never clear it on wide screens).

The composition then left the centered-poster stack entirely (founder direction, chosen from a three-concept judge panel): the text is now a **machined data plate** anchored to the frame's left datum — an L-bracket registers the kicker at the plate's corner, a hairline drops from the telemetry dot to make the datum visible, the headline sets as two engraved lines (bright lead, dim second) at a capped measure over a left spine scrim, and the micro-badges became a calibrated spec row (hairline rule, gold end tick, square tick separators). The blurb became the **instrument readout**: docked at the frame's right beside the subtitle zone — never over the needle or dial — hung from the HUD tier by a hairline connector, with a mini linear gauge whose gold tick moves in sync with the 0.7s needle sweep. A right-column reservation at md+ guarantees the plate and the readout can never collide at any viewport (Tailwind's lg begins at exactly 1024px, where an early "release" of that reservation put the dim headline line under the panel — caught in visual verification).

Adaptations the product required of the kit: the stations are **real controls** whose blurb carries the actual link into the section (a labeled group placed after the h1 in DOM order, so assistive tech meets the heading first); every engraved number and count derives from the content manifest; the bezel engraves each section's short name with the full title as the accessible name; dial coordinates round to hundredths (Node's and Chromium's `Math.sin` differ by an ulp — enough to flag every tick as a hydration mismatch); and the kit's "QPU live · IQM Garnet" HUD line ships as "Simulator live · in-browser" instead — hardware runs are not currently available, and a test now pins the aspirational line out.

### Components

- Nine `bg-smoke` self-dark islands → `bg-abyss`; the code fence island moved off cool `gray-900` onto the pinned abyss.
- Data-viz: progress rails and the sidebar course bar consolidated onto `.bar-fill`; the QFT peak bin is gold (the detected signal), the noise-degraded bar and the barren-plateau series are oxblood, the VQE exact-energy reference is jade; the Bloch 3D probe fallback and wireframe constants re-anchored (`#A38560`, `#93A198`).
- Status language unified: gold = done/live signal, warm = in-flight/attention/hazard, danger = failure, jade = validation. All raw `red/amber/emerald/rose` utilities converted to the semantic tiers (delete-account, QPU alerts and status chips, metrics chips and series, device-table analog flag, checkpoint failure marker).
- Typography: Sora now loads 300/400 only (the display-weight rule enforced at load time); every faux-bold on Geist Mono (which loads 400/500) capped at medium; standalone numeric readouts — hero stats, workspace instruments, prices, credits, due counts — moved to Geist Mono per "everything measured is mono".
- Fog canvas palettes re-tinted (silver + faint gold glows dark; green-tinted haze light); credential enamel hues re-mapped (completion now strikes in brand gold).

### Guards

- `token-contrast.test.ts` learned hex anchors, parses the chip ink out of `.chip-selected` itself, gained suites for the semantic tiers, the abyss contract (declared once, `@theme` twin identical), and the phase scale's symmetry + hue-freedom. The light-accent graphics tripwire restated as min-across-surfaces (gold measures 3.14:1 on one near-white surface; one passing surface doesn't make it universally safe).
- New `theme-color.test.ts` binds the browser-chrome `themeColor` hexes to `--surface-base` per theme — previously the one palette literal shipping with zero coverage.
- `caption-contrast`'s pinned-dark skip extended to `bg-abyss`; eyebrow assertions re-anchored on the recipe class.

### Design-sync inputs

`.design-sync/conventions.md` rewritten for the after-dark system (it becomes `ds-bundle/README.md` verbatim on rebuild); the stale palette bullet in `NOTES.md` corrected and an after-dark re-sync section appended; preview hex literals moved to the new dark card / muted ink values.

### The full design-system project, swept

A file-by-file pass over the complete *Quantum Learner Design System* project (tokens, fonts, 19 components, 18 guideline cards, the 3-screen web UI kit, imagery) confirmed the product now carries everything it mandates, and closed the four remaining deltas: the `Logo` component re-based on the commissioned one (token-driven gold via `--accent`, size-adaptive machining — strokes step up to the app-icon weights below 26px); the footer gained the kit's mono mark at 20px in the muted ink; the Review due-count now rides `chip-selected` (the one gold fill, per the kit's nav); and the code fence took the commissioned chrome — a racing-green→abyss gradient island with an inset silver highlight, bordered gold language chip, and green-silver controls. The kit's Playground and Review screens verified as faithful recreations of the product's existing surfaces (no new mandates), and one inversion surfaced: the design project's `assets/imagery/*.webp` are still the **teal** originals — its own brand-imagery guideline says "cool greens", which the product's jade regrades satisfy — so the imagery flows product→project at re-sync, not the other way.

### Adjacent tooling

The doc renderer (`~/.claude/scripts/render-doc.mjs` + `doc-tokens.css`), whose palette is by its own docstring "the Quantum Learner system so specs and audits read as one series," was re-tokened to after-dark — this page is rendered with it.

## Verification

- **2604/2604 Jest tests green** across 221 suites, including the recomputed WCAG guards: light ink 13.5:1, dark accent 7.7:1, muted 6.2–6.8:1, chip ink 5.3/7.6:1, every semantic-tier text pair ≥ 4.5:1, inline-code chip ≥ 4.8:1 over all six section hues in both themes.
- **Static export builds** (122 pages) and ESLint is clean.
- **Playwright screenshots** of home (both themes, three scroll depths), auth, and the widget fixtures confirm the rendered result; the in-browser Pyodide e2e suite passes against the build.
- **An adversarial multi-agent review** (4 lenses × independent verification per finding, 21 agents) confirmed 15 defects, all fixed before landing — notably: the pricing headline's gradient tail was sub-AA in the light theme (2.84:1 — re-clipped to the paired-down gold); negative Hamiltonian coefficients had been put on the phase scale, contradicting its own "phase only, never magnitude" contract at ~1.6:1 salience (now muted silver at 4.9–5.6:1 vs the rail); "in-flight" job chips had landed on the caution tier (now neutral chrome with the gold live-dot idiom); "met" re-tiered onto jade; the noisy series and the PES equilibrium landmark moved off caution; two grep-guard loosenings were reverted or hardened; and two new guards landed — one pinning the `.eyebrow` recipe's geometry in the stylesheet, one banning synthetic bold over Geist Mono repo-wide. Two further reviewer claims were adversarially refuted with rendered-pixel proofs and left unchanged.

One environment find along the way: the local JupyterLite lab under `web/public/lab/` (gitignored build output) was stale — it still carried `qcsim-0.2.0` while `main`'s content manifest pins `0.3.0`, so every Pyodide e2e failed with "couldn't load the Python runtime" before this work began. `jupyterlite-build/build.sh` (after clearing a half-broken venv whose interpreter probe passed but whose `pip` was gone) restaged the lab; the suite then passes 7/7 on a `.env.local` build, and the eighth spec (`workspace-lab`, written for a build with *no* Cognito env, where the workspace renders its unconfigured bench instead of the auth wall) was proven green in 176ms against an env-less build of this same branch.

## Follow-ups (deliberately not in this change)

- **`ds-bundle/` regeneration + re-upload** to the design project: rebuild `web`, restage `ds-styles.css` + fonts, run the resync driver, upload per the design-sync skill. The bundle is a gitignored artifact; its hand-maintained inputs are already rewritten. The remote project's olive-era handoff HTML sits outside sync scope and needs manual replacement.
- **Amplify deploy** ships all of this on the next push of `main` — merging is not shipping.
- Badges struck after this date (charter-02+) should use the after-dark system; `.design-sync/` remains untracked — committing it is a separate decision.
