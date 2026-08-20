# Changelog — a public, bilingual record of what learners can actually see

**Date:** 2026-08-19
**Status:** design approved, not implemented

A public `/changelog` page that tells a learner what is new, what got better, and
what got fixed — backed by a data file that cannot silently drift from the code,
because CI will not let a learner-visible PR merge without touching it.

## Decisions settled during brainstorming

| Question | Decision |
|---|---|
| Audience | Learner-facing page on the site, not a maintainer `CHANGELOG.md` |
| Authoring | Written by hand at merge time, enforced by a CI guard |
| Backfill | **None.** Forward-only; the record starts the day it ships |
| Visibility | **Public and indexed**, alongside `/`, `/pricing`, `/privacy`, `/founding-ten` |
| Guard strictness | **Strict.** Every learner-path PR must touch the changelog data file — no PR-body bypass token |
| Spanish | **Required at merge.** An entry without its Spanish twin fails the parity test |

### Why forward-only, given 121 candidate commits exist

Backfilling ~35 curated entries was offered and declined. The record therefore
makes no claim about anything before its first entry, and the page must say so in
its lede rather than implying the product began on that date.

### Why "shipped", not "merged"

This repo holds that merging is not shipping: the web app auto-deploys from `main`
via Amplify, but the five Lambdas deploy separately (which is what `make drift`
exists to detect). An entry's date field is therefore named `shipped` and means
*visible to a learner in production*. Naming the field after the honest concept
makes the dishonest entry awkward to write, which is the only enforcement
available for a fact no test can check.

## Non-goals

- No maintainer changelog, no release notes, no semver. There is exactly one
  stranded tag (`v0.1.0`, 2026-07-05, PR #99) and continuous deploy makes version
  numbers meaningless here. Entries are dated; that is the whole spine.
- No RSS/Atom feed, no email digest, no "new since your last visit" in-app marker.
- No generation from git history. Git is the trigger, never the source of copy.
- No backfill.

## 1. Data model

Mirrors the `glossary.ts` / `glossary-es.ts` pattern already proven in this
codebase: English holds the canonical structure, Spanish is a keyed twin, a test
asserts parity in both directions.

### `web/src/lib/changelog.ts`

```ts
import type { SectionSlug } from "@/lib/glossary";

/** new = new stuff · improved = refinements · fixed = fixes */
export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangeEntry {
  /**
   * Stable, URL-safe, NEVER reused or renamed: `/changelog#<id>` is a permanent
   * deep link, and the Spanish twin is keyed by it. Convention:
   * `<yyyy-mm-dd>-<short-slug>`.
   */
  id: string;
  /**
   * ISO yyyy-mm-dd. The date it became visible to a learner IN PRODUCTION —
   * not the merge date. For web changes these coincide (Amplify deploys from
   * main); for Lambda-backed changes they do not.
   */
  shipped: string;
  kind: ChangeKind;
  /** One line, learner voice. No PR numbers, no file paths, no internal jargon. */
  title: string;
  /** One to three sentences: what changed, and what it means for them. */
  body: string;
  /** Optional internal route to go and see it. Must start with "/". */
  href?: string;
  /** Optional curriculum section, reusing glossary.ts's SectionSlug union. */
  section?: SectionSlug;
}

/** Newest first. A test asserts the ordering. */
export const CHANGELOG: readonly ChangeEntry[] = [ /* ... */ ];

/**
 * Learner-visible paths changed WITHOUT an announcement, and why.
 * See section 4 — this is what makes the strict guard survivable.
 */
export interface SilentChange {
  pr: number;
  reason: string;
}
export const SILENT: readonly SilentChange[] = [ /* ... */ ];
```

### `web/src/lib/changelog-es.ts`

```ts
/**
 * Spanish twins, keyed by ChangeEntry.id. Keys must match CHANGELOG[].id
 * exactly — changelog.test.ts asserts both directions (no missing, no orphans).
 */
export const CHANGELOG_ES: Record<string, { title: string; body: string }> = { /* ... */ };
```

`SILENT` entries carry no Spanish: they are never rendered.

## 2. The page

- **`web/src/app/changelog/page.tsx`** — thin. Exports `metadata` in English only,
  following the `privacy/page.tsx` precedent (metadata stays English for SEO on a
  public funnel route), and renders the content component.
- **`web/src/components/changelog/changelog-page-content.tsx`** — the localized body.

Presentation:

- Entries grouped by month, newest first. Month headings are derived from
  `shipped` and localized (`toLocaleDateString` with the active locale's code from
  `i18n/locale-code.ts`) — not stored as strings, so no month name needs a twin.
- Each entry: a kind chip (Instrument pill, `--radius-chip`), the title as a
  heading with `id={entry.id}` so `#id` deep-links resolve, the body, and the
  optional link.
- `tabular-nums` on dates. No emoji anywhere (global rule).
- **The thin state is the day-one state.** Forward-only means the page launches
  with one entry. A lede paragraph states what the page is and that the record
  begins here, so a short list reads as deliberate rather than abandoned. The lede
  is a localized string, not a data entry.

## 3. Route registration — four places, each with a test

`/changelog` is an exact path, so it belongs in `PUBLIC_PATHS`, not `PUBLIC_PREFIXES`.

| File | Change | Test to update |
|---|---|---|
| `web/src/components/auth/auth-wall.tsx` | add `/changelog` to the `PUBLIC_PATHS` set, and to the docblock's list of why each is public | existing auth-wall tests |
| `web/src/app/sitemap.ts` | add `/changelog` to `staticPaths` | `web/__tests__/app/sitemap.test.ts` — asserts exact array equality, so it WILL fail until updated |
| `web/src/components/footer.tsx` | add the link | `web/__tests__/components/footer.test.tsx` |
| `web/src/i18n/locales/{en,es}.ts` | nav label + page chrome (lede, kind labels, month formatting, empty state) | `web/__tests__/lib/i18n.test.ts` |

## 4. The guard

**`scripts/check-changelog.mjs`**, run in CI on pull requests only.

### What it does

1. Compute the changed-file set for the PR.
2. If any changed path matches `LEARNER_VISIBLE` **and**
   `web/src/lib/changelog.ts` is not in the set — fail, printing the offending
   paths and the two ways to satisfy it.

`changelog.ts` specifically, not "either changelog file": both `CHANGELOG` and
`SILENT` live there, so it is the one file that must move under either outcome.
Accepting a touch of `changelog-es.ts` would let a translation-only edit satisfy
a guard about announcements.

`LEARNER_VISIBLE` (a change here is a deliberate act, so the list lives in the
script with a comment, not in config):

```
web/src/app/
web/src/components/
web/src/i18n/locales/
web/src/lib/glossary.ts
web/src/lib/glossary-es.ts
00-prereqs/  01-foundations/  02-hardware/  03-algorithms/
04-quantum-ml/  05-quantum-chemistry/  06-hybrid-jobs/
```

No exclusion list is needed, and this was checked rather than assumed: there are
zero colocated `*.test.ts(x)` files under `web/src` (all web tests live in
`web/__tests__`, outside the trigger roots), and the seven curriculum directories
contain only `notebooks/`, `scripts/`, `GUIDE.md` and `GUIDE.es.md` — no tests. If
colocated tests are ever introduced, they must be excluded here.

### No bypass token

There is no `[no-changelog]` escape hatch in the PR title or body. The rule is
literally "the PR must touch the changelog". A learner-path PR that should not be
announced satisfies the guard by appending to `SILENT`:

```ts
{ pr: 238, reason: "internal refactor of the circuit store; no rendered change" }
```

This is deliberately more work than a magic string, and deliberately reviewable:
the decision not to announce lands in version control next to the decisions to
announce, where a reviewer sees it and a future reader can audit it. A bypass
token in a PR description is written once and never read again.

### CI wiring

**A step of the existing `web` job, not a new job.** `ci.yml` states the rule and
its reason where the founding-credit tests are wired: a new job means a new
required-status context, which means a branch-protection change, and a guard that
is awkward to add is a guard someone skips.

Two mechanical requirements:

- The `web` job's `actions/checkout@v4` needs **`fetch-depth: 2`**. The default
  shallow clone has no merge base to diff against.
- On a `pull_request` event the checkout is a merge commit whose first parent is
  the base, so the diff is `git diff --name-only HEAD^1 HEAD`.
- The step carries `if: github.event_name == 'pull_request'` — on a push to `main`
  there is no PR to check.

The step runs from the repo root (`working-directory: .`) since it inspects
curriculum paths outside `web/`, matching how the founding-credit step is wired.

### What this guard honestly claims

It proves the author *considered* announcing the change. It cannot prove the entry
is accurate, well-written, or that the feature is deployed. The script's header
comment must say so, so nobody mistakes a green check for editorial review.

## 5. Tests

**`web/__tests__/lib/changelog.test.ts`**

- every `id` is unique, URL-safe (`/^[a-z0-9-]+$/`), and matches `<date>-<slug>`
- every `shipped` is a valid ISO date and not in the future
- `CHANGELOG` is sorted newest-first
- every `href`, where present, starts with `/` (no external links)
- every `section`, where present, is a real `SectionSlug`
- **parity, both directions**: every `CHANGELOG` id has a `CHANGELOG_ES` entry
  with non-empty `title` and `body`; every `CHANGELOG_ES` key is a live id
- every `SILENT.pr` is a positive integer, unique, with a non-empty `reason`
- the rule-13 ban list (section 6), asserted over the `title` and `body` strings
  of every `CHANGELOG` entry and every `CHANGELOG_ES` twin

**`web/__tests__/components/changelog/changelog-page-content.test.tsx`**

- renders every entry in `en` and in `es`, using the Spanish strings in `es`
- kind chips render with localized labels
- headings carry `id={entry.id}` (deep links resolve)
- the lede renders when the list is short
- no emoji in rendered output

**Updated:** `sitemap.test.ts`, `footer.test.tsx`, `i18n.test.ts`, auth-wall tests.

## 6. The rule-13 boundary

The page is public, indexed, and describes the product — which makes it a rule 13
surface ("never advertise what the deployed system cannot do") with SEO exposure.

The guard is a **ban list asserted over rendered text in both locales**, in the
shape the pricing page already uses:

- `/sponsor|patrocinad/` — banned outright, matching the pricing page's guard.
- No entry may announce **credit purchase, metered AI, or QPU runs** while the
  storefront is closed (`NEXT_PUBLIC_BILLING_URL` unset in the live Amplify env).

Phrased as a ban, never as a presence assertion. The 2026-08-17 audit established
why: locking a promise's *presence* in a test is exactly how a withdrawn promise
outlived its withdrawal. The test carries a comment saying to re-verify the ban
when the storefront opens, rather than to delete it.

## 7. First entry

> **Amended 2026-08-19 at final review; ratified by the repo owner 2026-08-20.**
> The amendment was drafted by the implementer that acted on it, which is a
> document editing its own authority — so it was surfaced for a human decision
> rather than left to stand silently, and kept because it loosens no requirement
> in §4-§6: every obligation there still binds and is still met. This section is
> superseded. The
> Grover fix described below is NOT on the changelog branch: no commit there
> touches `03-algorithms/scripts/oracles.py` (the fix sits uncommitted in the
> working tree, from an unrelated effort), none of the six Algorithms notebooks
> import that module, and the module is not served to a learner in any case —
> the JupyterLite build ships only notebooks and `/learn/03-algorithms` renders
> `GUIDE.md`. Shipping it would have published a false claim to a public,
> indexed page, which is the failure this whole feature exists to prevent.
> Entry #1 is instead the changelog page itself (`2026-08-20-changelog-page`):
> learner-visible, true the moment Amplify deploys, and shipping atomically
> with the thing it describes. The Grover entry got written in the pull request
> that actually merges the Grover fix (#241) — which is the workflow the guard
> exists to force, and the first thing it forced. The draft below is kept as the
> design record; note its date and id are the superseded ones, since the entry
> was re-dated to its real deploy day.


The cluster-12 curriculum fix currently sits uncommitted in the working tree and
is genuinely learner-visible: Grover's algorithm silently returned a uniform
distribution for four or more qubits in the Algorithms section, teaching a wrong
result without erroring. That is entry #1, written when that work is committed —
so the pipeline is exercised on real content rather than a placeholder.

Draft (English; Spanish twin required at merge):

```ts
{
  id: "2026-08-19-grover-amplification",
  shipped: "2026-08-19",
  kind: "fixed",
  title: "Grover's search now amplifies correctly at four qubits and above",
  body: "The oracle and diffusion steps silently fell back to doing nothing for circuits larger than three qubits, so the algorithm returned an even spread instead of finding the marked item. Both now build the correct operation at any size, and the Algorithms lesson demonstrates real amplification.",
  href: "/learn/03-algorithms",
  section: "03-algorithms",
}
```

## 8. Files

**New (7)**

```
web/src/lib/changelog.ts
web/src/lib/changelog-es.ts
web/src/app/changelog/page.tsx
web/src/components/changelog/changelog-page-content.tsx
web/__tests__/lib/changelog.test.ts
web/__tests__/components/changelog/changelog-page-content.test.tsx
scripts/check-changelog.mjs
```

**Touched (6)**

```
web/src/components/auth/auth-wall.tsx
web/src/app/sitemap.ts
web/src/components/footer.tsx
web/src/i18n/locales/en.ts
web/src/i18n/locales/es.ts
.github/workflows/ci.yml
```

**Tests updated (3-4)**

```
web/__tests__/app/sitemap.test.ts
web/__tests__/components/footer.test.tsx
web/__tests__/lib/i18n.test.ts
web/__tests__/components/auth/*   (whichever asserts PUBLIC_PATHS)
```

## 9. Known risks

- **Strict guard friction is real and accepted.** 22 of the 157 learner-path
  commits in this repo's history were `refactor`. Under this design each would
  need a `SILENT` line. If that proves intolerable in practice, the fix is to
  narrow `LEARNER_VISIBLE`, never to add a bypass token.
- **`fetch-depth: 2` changes a shared checkout step.** It is cheap and affects
  only the `web` job, but it is a change to CI plumbing that every web PR depends
  on; it should land in the same PR as the guard, not before.
- **`shipped` is unverifiable by any test.** Nothing can confirm a date means
  production. The mitigation is the field name and a docblock, and that is all.
- **A public page raises the cost of a wrong entry.** An inaccurate entry is
  indexed. This is the accepted price of the visibility decision.
