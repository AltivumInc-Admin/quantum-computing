# Product

<!-- impeccable:product-schema 1 -->

Durable product truth for Quantum Learner (quantum.altivum.ai). Written from the
founder-confirmed 2026-07 strategy pass and re-grounded against the codebase on
2026-08-02, when five independent read-only passes found 41 contradictions in the
previous record — including an inverted claim about who pays for quantum
hardware. Facts here are repo-verified or founder-decided; open decisions are
marked as such rather than resolved by inference.

## Platform

web

## Register

**Product.** Design serves the learning task; the tool should disappear into it.
Interactive lesson widgets, a spaced-repetition review inbox, a workspace, a
glossary — app UI, not marketing. The landing and pricing surfaces borrow warmth
from the same system, but there is one register default: product.

## Users

A three-rung ladder. Nothing gates on *prior* credentials, but a free account
gates the platform itself (see Operating Context).

1. **Newcomer** — a self-directed autodidact with programming instincts and no
   quantum background. Beginner-friendly funnel.
2. **Practitioner** — the retention target, defined by **producing a validated
   algorithm and an exportable artifact**: OpenQASM 3.0 export, a playground
   handoff, a correct server-checked cost estimate. Real-hardware execution is
   optional proof of that competence, not the definition of the rung, and not a
   spending requirement. (Founder decision, 2026-08-02; supersedes the previous
   definition, which was "eventually touches real QPU hardware, sponsored.")
3. **Subject-matter expert** — the top rung shapes the platform itself
   (contributed Reps, community depth). Top of funnel is the content pipeline.

Context of use: evenings and weekends, personal machine, often alongside a
notebook or the lab. They are *in a task* — learning, practicing, reviewing.

## Product Purpose

A browser-first quantum computing learning platform built on Amazon Braket.

**Free to learn. You pay only for real hardware and for AI beyond the free
tutor.** (Founder decision, 2026-08-02.) The curriculum, the browser simulator,
the playground, the glossary, the review queue and cross-device sync are
committed free permanently; metered surfaces are named plainly rather than
hidden behind the word "free."

**North-Star: mastery gained** — skills moved into proven,
spaced-repetition-verified retention each week. Progress-native and impossible to
cram. It is instrumented, not aspirational: a skill counts as retained at a
21-day scheduler stability threshold (`web/src/lib/runbook.ts`), with
`masteryCount` / `masteredThisWeek` derived from it. The rejected framing, and an
important anti-goal, is "weekly hands-on practice" — that measures activity, not
progress (the Duolingo trap).

## Positioning

**Everything runs client-side, and browser-runnability is machine-enforced
rather than asserted.** The default grader is TypeScript against an in-repo
state-vector kernel with zero network; Pyodide plus a qcsim/Braket-parity kernel
powers the JupyterLite lab and the gated Python grading tier. qcsim registers
itself under `braket.*`, so `from braket.circuits import Circuit` resolves
identically in the browser and in the lab, with a parity suite run against the
real SDK's LocalSimulator. A build-time contract check proves which notebooks
actually run in a browser, so the claim cannot drift.

That combination — real code, real Braket semantics, no install, no cloud spend
to learn — is what a neighboring product cannot truthfully copy without building
the same kernel.

## Operating Context

- **An account is mandatory and is the product's spine.** Only `/`, `/pricing`,
  `/login`, `/auth/callback`, `/privacy`, and `/founding-ten/*` are public;
  everything else sits behind a free Cognito account (email/password or Google,
  with self-serve deletion). Honest caveat, documented in the code: under static
  export the wall is an **access gate, not a confidentiality boundary** — lesson
  content remains recoverable from the static payload.
- **The account carries synced state** across devices: module completion, review
  cards and cached card content, personal-best gate counts, saved playground
  circuits, and locale. Sync is pull → deterministic domain-merge → push with
  409 re-merge, namespaced per owner so a shared browser never leaks between
  accounts.
- **Bilingual chrome.** English and Spanish (es-MX, chosen for date order and
  number grouping), on an owned ~200-string i18n layer rather than a library
  (static export precludes Next's server-side i18n routing), with CI-enforced
  dictionary *and* plural-shape parity between locales.
- **Inverted SEO posture.** Only the public routes above are indexable; every
  walled route carries `noindex`.

## Capabilities and Constraints

**Curriculum.** Seven sections (00-prereqs → 06-hybrid-jobs, with QML and
chemistry as sections 04 and 05 *inside* that sequence, not side tracks), 45
notebooks, 32 browser-runnable. The 13 that are not — including all seven of
06-hybrid-jobs — require the real `amazon-braket-sdk`. 133 graded exercises;
every notebook carries at least one. The exercise convention is a fixed
three-cell unit with two mandatory hint tiers that steer without solving; checks
are property-based and never string-compare learner source. The grading runtime
is stdlib-only and never raises for a learner, so an unattempted notebook still
runs clean. CI proves both directions: checks pass with the canonical answer and
must fail unsolved.

**Reps and scheduling.** Six graded kinds (challenge, predict, bloch, cost,
debug, expect) that re-mount as live widgets on `/review`, plus recall cards and
self-check quizzes feeding the same scheduler. The scheduler is **bespoke and
dependency-free, in the FSRS/SM-2 family — it is not FSRS**: stability-as-
interval, ease from a 1–10 difficulty, lapse resets to one day, monotonic
intervals clamped at 365 days, overdue credit on mature reviews. Validation
blocks degenerate content that would mint schedule cards for zero effort.

**AI tutor ("Ask the margin").** A Cmd/Ctrl-K slide-over that streams a
Claude answer grounded in the lesson being read, live behind CloudFront. Metering
is implemented but not deployed: reserve-before-stream, settle on real Bedrock
token usage, with a tier-gated model roster (free tier metered at zero as the
funnel; paid tiers add stronger models). Charged at cost — the margin is the
subscription, not a markup on inference. **The roster is the product claim and is
test-asserted.**

**Commercial model.** Three tiers — Free, Plus, Pro — at the prices published in
`web/src/lib/pricing.ts` (`TIERS`, mirrored by `CATALOG` in
`lambda/stripe/index.mjs`; per CLAUDE.md rule 8 the figures are not restated
here — a hardcoded price in this file has already gone stale across one
repricing). A dollar-pegged wallet (1 credit = $0.01), Stripe checkout with a
fixed catalog plus custom top-ups, and refund/dispute clawback with a
debt-clearing rule: clawbacks pro-rate against what was actually paid, a
shortfall becomes `clawbackOwedCredits`, every money-in path (top-ups and
renewals alike) pays that debt down before granting spendable credits, and a
dispute the learner wins restores exactly what was taken and clears exactly the
debt it created. **The storefront is
deliberately closed** — no billing URL is set in the live environment, and no
money has ever moved.

**Hardware pricing — founder decision, 2026-08-02.** The published sheet stands:
34 credits per task and 0.163 credits per shot on IQM Garnet. This sits above the
underlying Braket cost ($0.30/task + $0.00145/shot, which the Lambda debits as 30
credits + 0.145/shot), so **compute carries a margin alongside the
subscription**. Two consequences are work, not facts: the Lambda's debit rates
and the published sheet must be reconciled to one number, and the QPU panel's
"You pay for these runs at cost. We add nothing on top." must be retired.

**Sponsorship is withdrawn.** As of 2026-07-28 the platform no longer funds
learner hardware runs; a new learner's lifetime allowance is zero, test-locked,
with an explicit `effectiveCap > 0` guard because a zero cap alone still handed
out one free real-money run. Exactly one production account retains a
grandfathered stamped allowance. The withdrawal is documented as not cleanly
reversible.

**Hard spend fences, treated as a design commitment.** One device (IQM Garnet,
eu-north-1), a 1,000-shot per-run ceiling, a $15.00/day global kill-switch, and
an entitlement gate that is itself pedagogical: the learner must correctly price
a run and the server re-computes the true cost before any spend is allowed. Money
is integer micro-dollars, and credit conversion rounds up so a fraction of a cent
is never dispensed free. Ordering rule: **buying must work before metering turns
on.**

**Other surfaces.** `/workspace` (signed-in cockpit with one deterministic next
action), `/playground` (four-qubit live sandbox, no run button, QASM export, URL
sharing, synced saves), `/credentials` (completion, mastery, consistency and
hardware groups derived purely from synced progress; mastery can lapse), 
`/founding-ten` (public numbered scarcity credential, 20 places, bound to a
SHA-256 of the holder's email so it survives account deletion and duplicate
sign-ins — and carrying **no product entitlement**), `/runbook`, `/glossary` (93
terms, bilingual, per-term permalinks), `/pricing`, `/privacy`, plus opt-in
reminder emails whose daily sender is currently disabled.

**Runtime constraints.** One pinned Pyodide version serves both the lesson
runtime and the lab kernel, self-hosted same-origin; the build fails if any
staged `.wasm` exceeds CloudFront's compression ceiling.

### Known divergences (dated, not designed)

- **Deployed Lambdas lag `main`.** The live QPU function predates the
  sponsorship withdrawal and runs without wallet metering; the live tutor is free
  and unmetered. In production the platform still pays; in `main` it does not.
- **Roughly nine shipped pricing strings in both locales still tell learners
  hardware runs are platform-sponsored**, and one is locked by a test — so the
  copy sweep requires a test change.

## Brand Commitments

Professional, precise, quietly confident. The register of Linear, GitHub, and a
Bloomberg terminal — an instrument, not a game. Sophistication is the brand: real
physics notation (kets, θ/φ, KaTeX), exact numbers, honest grading
("Off by 12.3°"), no hedging and no cheerleading.

**Every mechanic must produce an artifact a peer would voluntarily show.** That
is the engagement law; `/credentials` and `/founding-ten` are it implemented.

### Anti-references

- **Duolingo-style gamification** — no XP, coins, mascots, confetti, guilt
  streaks. Founder-rejected, and verified absent from the codebase. The one
  streak mechanic that ships (the Runbook week streak) ships with earned
  freezes, which is the design answer to "no guilt streaks."
- **Emoji in UI** — hard ban, everywhere, always. Currently honored, but note it
  has **zero automated enforcement**: no test, no lint rule, no CI check.
- **Pop-sci quantum mystique** — no "spooky," no woo. The learner is treated as a
  future practitioner.
- **SaaS-cream landing clichés** — gradient-text heroes, metric-card grids.

## Evidence on Hand

- Real curriculum numbers (7 / 45 / 32 / 133) derived from the content manifest,
  not estimated.
- Live production identity pool and sync backend; both sign-in paths verified
  end-to-end.
- Founding Ten: 20 places, one issued — Charter 01, Irving Salinas.
- Braket rate figures ($0.30/task + $0.00145/shot, IQM Garnet) verified and kept
  in lockstep between the Lambda and the Python cost library by a test.
- **Absent, and not to be fabricated:** no customers, no testimonials, no revenue
  ($0 has ever moved), no benchmarks, and **no verified Bedrock inference rates**
  — the tutor's rate table is an explicitly unverified placeholder and is the
  single named blocker on reopening the storefront.

## Product Principles

1. **Consistency over surprise.** One widget vocabulary across ~30 explorables; a
   new widget should look like it always existed.
2. **The number is the delight.** Precision readouts — percentages, radians,
   degrees, Hartrees — in mono and tabular figures are the personality.
3. **Accessible by construction**, enforced in CI rather than reviewed by eye.
4. **Honest state.** Graded outcomes tell the truth, errors say what to fix,
   nothing celebrates prematurely — and the product never advertises a capability
   the deployed system cannot perform. This is enforced: the pricing page is
   test-guarded, on rendered text in every shipped locale, against selling
   features that do not exist.
5. **Fail toward undercharging.** Where metering is uncertain, the learner is
   charged less, never more.

## Accessibility & Inclusion

Four CI guards, all passing: **token contrast** (computes real WCAG ratios from
the color tokens in both themes — the load-bearing one, written after a retune
shipped a 2.79:1 accent while class-string greps stayed green), **contrast
guard** (class-string pairings including gradient stops and SVG fills), **caption
contrast** (a single muted text tier with exact-count exceptions), and **slider
target size** (WCAG 2.2 SC 2.5.8, 24px — added after a PR silently reverted an
earlier fix).

Beyond the guards: `role="status"` live regions for graded outcomes; every
aria-hidden 3D visualization paired with an sr-only text equivalent, test-asserted
to survive component swaps; managed keyboard focus when UI unmounts; and full
reduced-motion coverage, including a global iteration clamp so an infinite
animation that misses a per-element opt-out freezes on its end state rather than
sampling a random frame forever.

Fast motion is state feedback (~200ms); entrance choreography, scroll-linked
reveals and long ambient loops are decorative and reduced-motion-gated.

## Open decisions

- **Is Spanish a parity commitment or UI chrome?** Today chrome, glossary and
  pricing are bilingual with CI-enforced parity, but lesson prose, Rep prompts,
  all 45 notebooks and the tutor's answers are English-only. The tutor locale
  pass is described in its spec as a one-line change with significant learner
  impact and has never shipped. Undecided.
- **Should a Spanish-language browser auto-default via `navigator.language`, or
  must the learner opt in?** The code currently defaults to English; the spec
  flagged this for a decision and none is on record.
- **Reconciling the two hardware rate tables** (published sheet vs. Lambda debit)
  to one number, following the 2026-08-02 decision that the published sheet
  stands.
