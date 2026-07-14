# PRODUCT.md — Quantum Workspace (quantum.altivum.ai)

Strategic context for design and product work. Written from the founder-confirmed
2026-07 strategy pass (persona, North-Star, and register were explicitly decided,
not inferred). The visual system itself lives in `web/src/app/globals.css`
(Tailwind v4 `@theme inline` tokens) — see the Design System notes below.

## Register

**Product.** Design serves the learning task; the tool should disappear into it.
Interactive lesson widgets, a spaced-repetition review inbox, a workspace, a
glossary — app UI, not marketing. (The landing/home surface borrows warmth from
the same system but there is one register default: product.)

## What this is

A free, browser-first quantum computing learning platform built on Amazon
Braket. Its moat: every circuit, simulator, and grader runs **in the learner's
browser** (Pyodide + a qcsim/Braket-parity kernel) — zero cost, zero setup, real
code. The curriculum runs 00-prereqs → 06-hybrid-jobs plus QML and chemistry
tracks; graded "Reps" (challenge, predict, bloch-target, …) feed an FSRS
spaced-repetition scheduler so skills are measured, not just visited.

## Who it's for (three-rung ladder)

1. **Newcomer** — a self-directed autodidact with programming instincts and no
   quantum background. Beginner-friendly funnel; nothing gates on credentials.
2. **Practitioner** — the retention target. Runs real algorithms, tracks
   mastery, eventually touches real QPU hardware — **sponsored**: the platform
   pays Amazon Braket ($0.30/task + $0.00145/shot on IQM Garnet), the learner
   never does.
3. **Subject-matter expert** — the top rung shapes the platform itself
   (contributed Reps, community depth). Top of funnel is the content pipeline.

Context of use: evenings/weekends, personal machine, often alongside a
notebook or the lab. They are *in a task* — learning, practicing, reviewing.

## North-Star

**Mastery gained** — skills moved into proven, spaced-repetition-verified
retention each week. Progress-native and can't be crammed. The destination it
points to: real-hardware runs by practitioners who become SME contributors.
The rejected framing (important anti-goal): "weekly hands-on practice" — that
measures activity, not progress (the Duolingo trap).

## Brand personality

Professional, precise, quietly confident. The register of Linear, GitHub, and
a Bloomberg terminal — an instrument, not a game. Sophistication IS the brand:
real physics notation (kets, θ/φ, KaTeX), exact numbers (tabular-nums), honest
grading ("Off by 12.3°"), no hedging or cheerleading.

**Every mechanic must produce an artifact a peer would voluntarily show.**
That is the engagement law. Gamification exists (streak-like review, graded
Reps, credentials to come) but never gimmicky.

## Anti-references

- **Duolingo-style gamification** — no XP, coins, mascots, confetti, guilt
  streaks. Rejected explicitly by the founder.
- **Emoji in UI** — hard ban, everywhere, always (user-facing text, buttons,
  labels, placeholders).
- **Pop-sci quantum mystique** — no "spooky", no woo. The platform treats the
  learner as a future practitioner.
- **SaaS-cream landing clichés** — gradient-text heroes, metric-card grids.

## Strategic design principles

1. **Consistency over surprise.** One widget vocabulary (`WidgetCard`,
   `LabeledSlider`, `Chip`, `ProbBars`, eyebrow labels) across ~30 explorables;
   a new widget should look like it always existed.
2. **The number is the delight.** Precision readouts (percentages, radians,
   degrees, Hartrees) in mono/tabular-nums are the personality; motion is
   state-feedback only (150–250ms, `motion-reduce` covered, `animate-fade-up`
   for reveals).
3. **Accessible by construction.** WCAG contrast is CI-enforced
   (`contrast-guard.test.ts`); `role="status"` live regions for outcomes;
   aria-hidden 3D always paired with an sr-only text equivalent
   (`BlochVectorSR`); keyboard focus managed when UI unmounts.
4. **Honest state.** Graded outcomes tell the truth ("Not quite — 90.0° off"),
   errors say what to fix, nothing celebrates prematurely.
5. **Dark and light are equals.** Every token pair (`dark:` variants) ships
   together; `next-themes` class strategy.

## Design system pointers

- Tokens: `web/src/app/globals.css` — accent (teal), warm (amber) semantic
  pair, `--shadow-*` rim-lit elevation, `--text-display-*` fluid scale,
  `.surface-accent` (accessible filled CTA), `.chip-selected`, `.focus-ring`,
  `rounded-card`/`rounded-control`/`rounded-chip`.
- Fonts: Plus Jakarta Sans (body/UI) + Instrument Serif (display, sparingly).
- Shared widget kit: `web/src/components/quantum/widget-ui.tsx`.
- Never `bg-accent` + `text-white` (contrast guard fails CI).
