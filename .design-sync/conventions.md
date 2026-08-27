# Quantum Learner Design System — conventions

Presentational React primitives from the Quantum Computing Workspace
(quantum.altivum.ai), a learning app for Amazon Braket / PennyLane. This is
**"The Instrument, after dark"**: racing-green smoke-and-glass surfaces on an
abyss ground, a single **gold** signal, oxblood for caution, silver ink,
Sora + Geist type, and a hue-free phase convention for quantum data. Build
quantum and data-teaching UIs — circuit widgets, probability readouts,
learning cards.

## Setup

- **No provider or wrapper is required.** Components render standalone; just load
  `styles.css` (all tokens, utilities, and fonts).
- **Style with Tailwind utility classes**, not inline styles — this is a Tailwind
  v4 token system. Use the families below for your own layout glue.
- **Dark is the primary theme** (abyss ground `#071710→#03110D`, racing-green
  cards); light is the daylight theme (warm silver, green-black ink). Dark mode
  is opt-in via an ancestor `.dark` class
  (`@variant dark (&:where(.dark, .dark *))`). Most color tokens are theme-aware
  runtime CSS vars, so they resolve correctly under either.

## The styling idiom (real class vocabulary)

| Concern | Classes |
|---|---|
| Gold signal (micro-labels ONLY — eyebrows, status dots, active nav, ket/state labels, focus) | `text-accent` (theme-aware gold) · `border-accent` · `ring-accent` · tinted `bg-accent/10` |
| Eyebrow tier | `eyebrow` (Geist Mono 10px, 0.2em tracked caps, gold pair) · `eyebrow eyebrow-mut` (muted stat/field labels) · `eyebrow eyebrow-warm` (caution) · `eyebrow hue-text` (section identity) |
| Caution / stakes tier (oxblood) | `text-warm-dark dark:text-warm-light` · tinted `bg-warm/10` panels |
| Neutral surfaces / cards | `glass` (the smoke-and-glass recipe: translucent fill + backdrop-blur + hairline + elevation) · inner panels `bg-(--field) border border-(--bd)` |
| Self-dark islands (code fences, media frames, modal backdrops) | `bg-abyss` — pinned `#03110D` in BOTH themes |
| Text tiers | `text-(--ink)` (primary) · `text-(--mut)` (secondary) · `text-caption` (muted, AA) |
| Hairlines / dividers | `border-(--bd)` · stronger edge `border-(--bd-2)` |
| Radius | `rounded-chip` (full pill) · `rounded-control` (12px) · `rounded-card` (16px) · `rounded-frame` (20px) |
| Type | `font-sans` (Geist) · `font-display` (Sora, light 300/400 headlines — never bolder) · `font-mono` (Geist Mono — bra-ket, data, code, every standalone numeric readout) |
| Data bars (magnitude) | `bar-fill` (bronze→gold ramp) · `bar-shimmer` (one-shot sweep) · track `bg-(--track)` |
| Motion | `animate-signal` (slow live/status-dot pulse); the ambient fog is a host-app concern |

**Signature rules:**
- **Gold is a signal, never a button.** The primary CTA is the NEUTRAL
  high-contrast `surface-accent` (silver fill with green-black ink on dark, the
  inverse on light) — never a filled gold surface. A small *active/selected*
  chip fill may be gold via `chip-selected` (dark green-black ink).
- **Magnitude vs phase.** Probability/amplitude bars use the single bronze→gold
  `bar-fill` ramp. Relative phase is HUE-FREE: eight silver lightness steps
  `--phase-0…--phase-7`, symmetric (θ and 2π−θ share a value), with gold
  marking zero phase only. Never swap the two encodings.
- **Cards are glass.** Match `WidgetCard` — `rounded-card glass` — for sibling
  surfaces rather than an opaque fill.

## Where the truth lives

- `styles.css` — the compiled token + utility source (every color/radius/shadow
  token, the `.glass`/`.bar-fill`/`.surface-accent`/`.eyebrow` utilities, and
  the `:root`/`.dark` runtime-var palette resolve from here).
- Each component's `<Name>.d.ts` is its API contract; `<Name>.prompt.md` is its
  usage reference.

## Idiomatic snippet

```tsx
import { WidgetCard, Chip, ProbBars } from "<this design system>";

// A titled glass widget wrapping a probability readout — the DS's own pattern.
<WidgetCard eyebrow="Superposition" chips={<Chip>1 qubit</Chip>}>
  <div className="p-4">
    <ProbBars probs={[0.5, 0.5]} n={1} />
  </div>
</WidgetCard>
```

Compose components for structure; reach for the utility classes above for
spacing and layout. Amplitudes are `[re, im]` tuples; probability arrays have
length `2^n`.
