# Glossary Page — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Area:** `web/` (Next.js 16 static-export learning site)

## Goal

Add a `/glossary` page to the quantum-computing learning site: an alphabetical,
searchable reference of quantum-computing terms and their definitions. Make it
discoverable from a card on the welcome page and from a new site-wide footer.

## Why

The curriculum (00-prereqs → 06-hybrid-jobs) introduces a large vocabulary
(qubit, ansatz, Jordan–Wigner, Trotterization, …) scattered across lessons and
`qcard` flashcards. There is no single place to look a term up. A glossary gives
learners a fast reference and a sense of the field's shape, and reinforces the
existing curriculum by linking each term back to the lesson that teaches it.

## Decisions (from brainstorming)

- **Content:** comprehensive, freshly authored — ~60–100 clean term→definition
  entries spanning the whole curriculum. Not auto-extracted from qcards.
- **Discoverability:** a card on the welcome page *and* a new site footer link.
  No top-nav link.
- **Page UX:** live search/filter + a sticky A–Z jump-navigation. (Chosen over a
  plain grouped list or a minimal flat list.)
- **Linking:** every term carries a category chip and links to the lesson that
  teaches it.

## Architecture

A typed data module is the single source of truth; a server page shell handles
metadata; a client component handles interactivity. This mirrors the repo's
existing "single source of truth + derived UI" pattern (`lib/sections.ts`,
`content-manifest.json`).

### Component / file map

| File | Type | Responsibility |
|------|------|----------------|
| `web/src/lib/glossary.ts` | data + types | `GlossaryTerm` type, `GLOSSARY` array, `sectionShortLabel(slug)` helper, sort/group helpers |
| `web/src/app/glossary/page.tsx` | server component | route `/glossary`, exports `metadata`, renders atmosphere shell + `<Glossary />` |
| `web/src/components/glossary/glossary.tsx` | client component | search state, A–Z index, grouped rendering, empty state, a11y live region |
| `web/src/components/glossary/glossary-entry.tsx` | client/presentational | one term: name, category chip (hue + lesson link), definition, see-also links |
| `web/src/components/footer.tsx` | server component | site footer (new); links Glossary / Review / GitHub + copyright |
| `web/src/app/layout.tsx` | edit | mount `<Footer />` after `<main>` |
| `web/src/app/page.tsx` | edit | add glossary card after the section grid |
| `web/src/components/glossary-card.tsx` | server/presentational | welcome-page "Reference · Glossary" card (sibling of `SectionCard`, no number) |

> Component-vs-presentational split keeps the interactive surface (`glossary.tsx`)
> separately testable from the entry renderer and from the static data.

## Data model

```ts
// web/src/lib/glossary.ts
export type SectionSlug =
  | "00-prereqs" | "01-foundations" | "02-hardware" | "03-algorithms"
  | "04-quantum-ml" | "05-quantum-chemistry" | "06-hybrid-jobs";

export interface GlossaryTerm {
  term: string;          // canonical display name, e.g. "Bell pair"
  definition: string;    // 1–3 sentences; inline `code` and $math$ permitted
  section: SectionSlug;  // primary curriculum home → chip color + lesson link
  aliases?: string[];    // searchable alternates/symbols, e.g. ["CX"] for CNOT
  seeAlso?: string[];    // related terms (exact `term` values) → in-page anchors
}

export const GLOSSARY: GlossaryTerm[] = [ /* ~60–100 entries */ ];
```

### Categorization via the existing section taxonomy

Each term is tagged with one of the **7 existing curriculum sections**. This
single-sources categorization — no new taxonomy:

- **chip color** = that section's hue via `hueFor(index)` (reuses
  `lib/sections.ts`; six hues `[192, 290, 75, 160, 15, 230]` cycling over 7).
- **chip label** = a short section label resolved by `sectionShortLabel(slug)`:

  | slug | short label |
  |------|-------------|
  | `00-prereqs` | Prerequisites |
  | `01-foundations` | Foundations |
  | `02-hardware` | Hardware |
  | `03-algorithms` | Algorithms |
  | `04-quantum-ml` | Quantum ML |
  | `05-quantum-chemistry` | Chemistry |
  | `06-hybrid-jobs` | Hybrid Jobs |

- **chip link** = `/learn/{section}` (section-page granularity; there are no
  per-notebook anchors to target).

### Definition rendering

Definitions support a restricted inline subset: inline `` `code` `` and inline
`$math$`. Rendered by reusing the repo's existing `react-markdown` +
`remark-math` + `rehype-katex` stack (already a dependency, used by
`markdown-renderer.tsx`), constrained to inline output (no block elements). A
small `InlineMarkdown` wrapper encapsulates this so entries stay declarative.

## Page UX

Layout matches the approved mockup:

```
Glossary  (display serif heading + one-line intro)
[ search terms…                         ]   ← live filter
A B C D E F G … X Y Z                       ← sticky jump-nav; empty letters dimmed
─────────────────────────────────────────
A
  Amplitude        [Foundations]   complex number whose squared magnitude …
  Ansatz           [Quantum ML]    a parameterized circuit whose angles …
B
  Bell pair        [Foundations]   two maximally entangled qubits …          See also: Entanglement
```

Behavior:
- **Search** filters live on `term` + `aliases` + `definition` (case/diacritic-
  insensitive). Matching is substring; no fuzzy matching (YAGNI).
- **A–Z index** is a labeled `nav`; each letter anchors to its group heading.
  Letters with zero entries (after the current filter) are visually dimmed and
  non-interactive.
- **Grouping** by first letter of `term`; groups and entries sorted A–Z
  (locale-aware, case-insensitive).
- **Empty state** when search yields nothing: a short "no terms match" message.
- **Result count** is announced via an `aria-live="polite"` region as the user
  types.

## Footer (new)

No footer exists today; this adds a reusable one, mounted in `layout.tsx` after
`<main>`:
- Left: brand/tagline (e.g. "Quantum Workspace — learn quantum computing with
  Amazon Braket").
- Right: links — **Glossary** (`/glossary`), **Review** (`/review`), **GitHub**
  (the repo URL, `target="_blank" rel="noopener noreferrer"`).
- Bottom: copyright line.
- Style echoes `Nav`: top border, muted text, backdrop; full dark-mode support.

## Welcome-page card

`GlossaryCard` reuses `SectionCard`'s visual language (rounded card, surface
token, hover lift/glow) but reads as a *companion resource*, not a numbered
module:
- No `00`-style number badge; instead a small "Reference" eyebrow/label.
- Title "Glossary", a one-line summary ("Look up any quantum term — A to Z").
- A representative hue (e.g. the accent hue `192`) for its chrome.
- Links to `/glossary`.

Placed after the 7 section cards in the home grid (either appended as the final
grid item or in a short "Reference" strip below the Learning Path — final
placement decided in the plan, both are low-risk).

## Testing (Jest)

**Data integrity (`glossary.test.ts`):**
- Every `term` is unique (case-insensitive).
- Every `section` is one of the 7 valid slugs.
- Every `seeAlso` value resolves to an existing `term`.
- `GLOSSARY` is non-trivial (≥ 60 entries) and sortable A–Z.
- `sectionShortLabel` returns a label for all 7 slugs.

**Component (`glossary.test.tsx`):**
- Renders all terms grouped by letter on first paint.
- Typing in search narrows the visible set; non-matching terms disappear.
- Empty-result query shows the empty state.
- A category chip links to the correct `/learn/{slug}`.
- A–Z letters with no matches are non-interactive.

**Footer / home (`footer.test.tsx`, extend home test):**
- Footer renders the Glossary, Review, and GitHub links with correct hrefs.
- Home page renders the glossary card linking to `/glossary`.

## Accessibility

- Search input has an associated label.
- A–Z index is a labeled `nav`; anchors are real links with `aria-label`s.
- `aria-live` result-count announcements.
- Any entrance animation is gated behind `prefers-reduced-motion` (repo
  convention).
- Chip contrast reuses the existing hue utilities; no `bg-accent` + `text-white`
  combination (guarded by `contrast-guard.test.ts`).

## Out of scope (YAGNI)

- No top-nav link.
- No per-term detail pages or deep-linkable per-term routes (in-page anchors only).
- No editing UI, CMS, or backend — static typed data.
- No auto-extraction from qcards/GUIDE files.
- No fuzzy search, tags beyond the section chip, or difficulty levels.

## Risks / notes

- **Inline KaTeX reuse:** must confirm `react-markdown` can be constrained to
  inline-only output cleanly; fallback is inline `code` only (drop `$math$`)
  if it proves fiddly — definitions can be authored to avoid block math.
- **Content authoring volume:** ~60–100 entries is the bulk of the effort;
  accuracy matters (this is educational content). Entries will be drafted for
  user review.
- **Static export:** everything is build-time/client-side; no new runtime
  dependencies or env vars. Compatible with `output: "export"`.
