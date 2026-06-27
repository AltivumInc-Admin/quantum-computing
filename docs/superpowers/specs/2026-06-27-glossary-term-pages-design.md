# Per-Term Glossary Pages — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Area:** `web/` (Next.js 16 static-export learning site)
**Builds on:** `2026-06-27-glossary-page-design.md` (the `/glossary` page, shipped in PR #74)

## Goal

Give every glossary term its own pre-rendered, shareable URL (e.g. `/glossary/qubit`) so individual terms can be linked from articles. Each per-term page includes the same "explore more" affordances as the full glossary (category chip → lesson, see-also → related terms), plus a copy-permalink control, a "More in this category" list, and an env-gated CTA to sign up for The Quantum Workspace.

## Why

The glossary is a single long page today; a term cannot be linked to directly. Authors want to cite a specific term's URL in external writing, with a clean link preview. Real per-term URLs also improve SEO and let "see also" become true cross-links instead of in-page scrolling.

## Decisions (from brainstorming)

- **Per-term URL:** `/glossary/{termSlug}` — pre-rendered at build via `generateStaticParams` (required under `output: "export"`). Unknown slugs 404 (`dynamicParams = false`).
- **See also → term pages everywhere:** on both the full glossary list and the solo pages, see-also links point to `/glossary/{slug}` (not in-page anchors). This also retires the previously-deferred "dead anchor when a filter hides the target" issue.
- **Clickable term names:** on the full glossary list, the term name links to its own page; the category chip still links to its lesson.
- **Solo page always includes:** back-to-glossary link, term heading, category chip (→ lesson), definition, see-also (→ term pages).
- **Solo page extras (chosen):** copy-permalink button; "More in this category"; an env-gated Quantum Workspace sign-up CTA.
- **CTA today:** gated on `NEXT_PUBLIC_SIGNUP_URL` (mirrors the AskTutor / `NEXT_PUBLIC_TUTOR_URL` pattern in `web/src/components/ask-tutor.tsx`). Live link when set; tasteful "coming soon" teaser when not. Flips fully live with one Amplify env var when the Cognito sign-up exists.
- **Sharing/SEO:** per-term title + meta description (definition as plain text) + canonical URL + Open Graph / Twitter (summary) card meta. No generated OG images.

## Architecture

The feature is a new pre-rendered dynamic route plus a small set of focused components, reusing the existing typed glossary data module as the single source of truth.

### File map

| File | Type | Responsibility |
|------|------|----------------|
| `web/src/app/glossary/[term]/page.tsx` | server route | `generateStaticParams` (all terms), `generateMetadata` (per-term SEO/OG), `dynamicParams = false`; renders `<TermDetail>` |
| `web/src/components/glossary/term-detail.tsx` | server component | solo-page body (heading, chip, definition, copy-link, see-also, more-in-category, CTA, back link) |
| `web/src/components/glossary/category-chip.tsx` | presentational | extracted hue chip → `/learn/{section}`; reused by `GlossaryEntry` + `TermDetail` |
| `web/src/components/glossary/see-also-links.tsx` | presentational | renders see-also as `/glossary/{slug}` links; reused by `GlossaryEntry` + `TermDetail` |
| `web/src/components/glossary/copy-link-button.tsx` | client component | copies the page URL to the clipboard; transient "Copied" feedback |
| `web/src/components/glossary/workspace-cta.tsx` | server component | env-gated (`NEXT_PUBLIC_SIGNUP_URL`) sign-up CTA / "coming soon" teaser |
| `web/src/lib/glossary.ts` | modify | add `getTermBySlug`, `termsInSection`, export `plainText` |
| `web/src/lib/site.ts` | create | `export const SITE_URL = "https://quantum.altivum.ai"` — single source for the base URL |
| `web/src/app/sitemap.ts` | create | static `sitemap.xml`: home, `/glossary`, `/review`, 7 `/learn/{slug}`, and all 92 `/glossary/{termSlug}` |
| `web/src/app/robots.ts` | create | allow-all `robots.txt` referencing `{SITE_URL}/sitemap.xml` |
| `web/src/components/glossary/glossary-entry.tsx` | modify | term name → page link; adopt shared `CategoryChip` + `SeeAlsoLinks` |
| `web/src/app/layout.tsx` | modify | add `metadataBase: new URL(SITE_URL)` (imported from `@/lib/site`) |

`SITE_URL` lives in `web/src/lib/site.ts` and is imported by the layout, sitemap, and robots so the base URL is defined once.

## Data helpers (`web/src/lib/glossary.ts`)

```ts
export function getTermBySlug(slug: string): GlossaryTerm | undefined; // termSlug(t.term) === slug
export function termsInSection(section: SectionSlug, excludeTerm?: string): GlossaryTerm[]; // sorted A–Z, excludes excludeTerm
export function plainText(s: string): string; // strip $math$ + `code` (reuse the existing stripMarkup) for meta descriptions
```

`plainText` reuses the markup-stripping already added for search (`matchesQuery`); `matchesQuery` is refactored to call it so there is one stripper.

## Routing & metadata

```ts
// web/src/app/glossary/[term]/page.tsx
export const dynamicParams = false;

export function generateStaticParams() {
  return GLOSSARY.map((t) => ({ term: termSlug(t.term) }));
}

export function generateMetadata({ params }): Metadata {
  const term = getTermBySlug(params.term);
  if (!term) return {};
  const description = truncate(plainText(term.definition), 155);
  const url = `/glossary/${termSlug(term.term)}`;
  return {
    title: `${term.term} — Quantum Glossary`,
    description,
    alternates: { canonical: url },
    openGraph: { title: term.term, description, url, type: "article" },
    twitter: { card: "summary", title: term.term, description },
  };
}

export default function TermPage({ params }) {
  const term = getTermBySlug(params.term);
  if (!term) notFound();
  return /* atmosphere shell */ <TermDetail term={term} />;
}
```

`metadataBase` in the root layout makes the relative `canonical`/`openGraph.url` resolve to absolute `https://quantum.altivum.ai/...`.

> Next 15+ may pass `params` as a Promise; the implementation follows whatever the repo's existing dynamic route (`app/learn/[section]/page.tsx`) does, to stay consistent with the installed Next version.

## Sitemap & robots

App-Router metadata-route files, generated to static `sitemap.xml` / `robots.txt` at build (compatible with `output: "export"`).

```ts
// web/src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getSections } from "@/lib/sections";
import { GLOSSARY, termSlug } from "@/lib/glossary";

export const dynamic = "force-static"; // required under output: export

export default function sitemap(): MetadataRoute.Sitemap {
  const top = ["", "/glossary", "/review"].map((p) => ({ url: `${SITE_URL}${p}` }));
  const lessons = getSections().map((s) => ({ url: `${SITE_URL}/learn/${s.slug}` }));
  const terms = GLOSSARY.map((t) => ({ url: `${SITE_URL}/glossary/${termSlug(t.term)}` }));
  return [...top, ...lessons, ...terms];
}
```

```ts
// web/src/app/robots.ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` };
}
```

(Per-entry `lastModified`/`changeFrequency`/`priority` are optional and omitted — the curriculum has no per-term timestamps to single-source from, and inventing them adds noise.)

## Solo page layout (`TermDetail`)

```
← All terms                                  (link to /glossary)
Qubit                                         (h1, display type)
[Foundations]                                 (CategoryChip → /learn/01-foundations)
The basic unit of quantum information: …      (InlineMarkdown definition)
[ Copy link ]                                 (CopyLinkButton)
See also: Superposition, Bloch sphere         (SeeAlsoLinks → /glossary/{slug})
More in Foundations                           (termsInSection, each → its page)
  Bell pair · Entanglement · Hadamard gate · …
┌───────────────────────────────────────────┐
│ The Quantum Workspace — free               │  (WorkspaceCta: link if env set,
│ Track progress and go deeper. [Sign up]    │   else "coming soon" teaser)
└───────────────────────────────────────────┘
```

## Component contracts

- `CategoryChip({ section }: { section: SectionSlug })` — sets `--hue` via `hueFor(getSectionBySlug(section).index)`, label `sectionShortLabel(section)`, links `/learn/{section}` with `.hue-soft-bg .hue-text` (contrast-guard safe).
- `SeeAlsoLinks({ refs }: { refs: string[] })` — renders nothing when empty; otherwise "See also:" + comma-separated links to `/glossary/${termSlug(ref)}`.
- `CopyLinkButton` (client) — on click copies `window.location.href`; shows "Copied" for ~2s; accessible button with `aria-live` feedback; degrades to inert if `navigator.clipboard` is unavailable.
- `WorkspaceCta` (server) — `const url = process.env.NEXT_PUBLIC_SIGNUP_URL`; if set, a CTA card with an external `<a href={url}>` ("Sign up free"); if not, the same card styled as "coming soon" with no link. No emojis.

## Testing (Jest)

- **Data (`glossary.test.ts`):** `getTermBySlug` (hit + miss); `termsInSection` (same section only, excludes self, sorted); `plainText` strips `$math$` + `` `code` ``.
- **Route (`glossary-term-page.test.tsx`):** `generateStaticParams` returns one entry per `GLOSSARY` term (count + a sample slug); `generateMetadata` for a known term yields the title/description/canonical/OG shape; the page renders the term, definition, chip, see-also, more-in-category, and CTA.
- **Components:** `TermDetail` (all sections render; see-also + more-in-category hrefs are `/glossary/...`; chip href is `/learn/...`; back link → `/glossary`); `CopyLinkButton` (click copies, feedback appears — mock `navigator.clipboard`); `WorkspaceCta` (renders "coming soon" when env unset; renders the link when `NEXT_PUBLIC_SIGNUP_URL` set — mock `process.env`); `CategoryChip` / `SeeAlsoLinks` href correctness.
- **Updated `glossary-entry.test.tsx`:** term name links to `/glossary/{slug}`; see-also now asserts `/glossary/entanglement` (was `#entanglement`).
- **Sitemap/robots (`sitemap.test.ts`):** `sitemap()` includes the home/glossary/review routes, one URL per curriculum section, and one URL per `GLOSSARY` term (count = 3 + sections + terms); every URL is absolute under `SITE_URL`; `robots()` allows `/` and references `{SITE_URL}/sitemap.xml`.
- **Real-path build:** `npm run build` succeeds and emits `out/glossary/{slug}.html` for sampled terms (e.g. `qubit`, `bell-pair`, `variational-quantum-eigensolver`); each contains the definition, a `rel="canonical"`/`og:` tag, see-also `/glossary/` links, and the CTA markup. The build also emits `out/sitemap.xml` (containing a sampled term URL) and `out/robots.txt`.

## Accessibility & constraints

- Headings: solo page h1 is the term; "More in this category" is a labeled section. A11y for the copy button (label + `aria-live`).
- Contrast guard respected (chips use hue utilities, never `bg-accent` + `text-white`).
- No emojis. Static-export-safe: the only new env var is `NEXT_PUBLIC_SIGNUP_URL` (build-time inlined, optional); no runtime deps.
- Reduced-motion honored for any new transitions.

## Out of scope (YAGNI)

- Prev/next term navigation (not selected).
- Per-term Open Graph images.
- The actual Cognito sign-up flow / The Quantum Workspace app.

## Risks / notes

- **`params` Promise shape:** match the installed Next version by following `app/learn/[section]/page.tsx`.
- **Slug uniqueness:** already guaranteed by the existing data-integrity test (unique `termSlug`), so per-term routes never collide.
- **`metadataBase` is new:** adding it site-wide is benign and improves OG resolution for all pages.
