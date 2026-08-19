# Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, bilingual `/changelog` page on the Quantum Learner site, backed by a data module that CI will not let a learner-visible pull request change without saying so.

**Architecture:** English is canonical: `web/src/lib/changelog.ts` holds the entry array, the `SILENT` ledger, and the pure grouping/formatting helpers. `web/src/lib/changelog-es.ts` holds the Spanish twin keyed by entry id, exactly as `glossary-es.ts` twins `glossary.ts`. A thin `app/changelog/page.tsx` exports English metadata and renders a client `ChangelogPageContent` that groups by month and localizes through `useLocale()`. A dependency-free Node guard (`scripts/changelog/`) reads the pull request's changed-file list on stdin and refuses a learner-visible diff that leaves `changelog.ts` untouched.

**Tech Stack:** Next.js 16 (App Router, `output: "export"`), React 19, TypeScript, Tailwind CSS v4, Jest + ts-jest + Testing Library, `node:test` for the guard, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-19-changelog-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

**Product rules (from `CLAUDE.md`)**

- **This repo is PUBLIC.** Rule 6: no markup constant, cost basis, or margin math anywhere — in code, comments, docs, *or guard output*, which lands in a public Actions log.
- **Rule 13: never advertise what the deployed system cannot do.** The storefront is closed (no `NEXT_PUBLIC_BILLING_URL` in the live Amplify env) and `LIFETIME_CAP_MICROS` is `0`, so no learner can buy credits or run a QPU task today.
- **No emoji in project UI.** The codebase uses inline `<svg>` for iconography.
- Entry copy is learner voice: no PR numbers, no file paths, no internal jargon.

**Web test conventions**

- `web/jest.config.ts` sets `testEnvironment: "node"`. **Every test that renders must carry `/** @jest-environment jsdom *\/` as the very first thing in the file.** It is not inherited and there is no setup file.
- There is **no Jest setup file**. Each rendering test must `import "@testing-library/jest-dom"` itself or `toBeInTheDocument` is undefined.
- `jest.mock` factories cannot close over out-of-scope variables. Every mock in this repo does `const React = require("react")` **inside** the factory and returns `React.createElement(...)`, never JSX.
- `useLocale()` returns a working English-only value with no provider, so a test that forgets `<LocaleProvider>` passes silently in English. Wrap it, and assert both locales with `it.each(["en", "es"] as const)`.
- `npm test` runs from `web/` and fires a `pretest` hook (`node ../scripts/gen-tutor-core.mjs`).

**Node / CI constraints**

- CI pins `NODE_VERSION: "20"` (`ci.yml` line 28). Nothing newer than Node 20 may appear on the CI path.
- **There is no `package.json` at the repository root** and no root `"type": "module"`. The `.mjs` extension is load-bearing, and a repo-root script must import nothing outside `node:` builtins and other repo `.mjs` files — the `web` job's `npm ci` populates `web/node_modules` only.
- Node 20 cannot import `.ts`. The guard must never try to read `changelog.ts`'s *contents*; it only asks whether the path is in the diff.
- The `web` job sets `defaults.run.working-directory: web`. A repo-root step **must** override it with `working-directory: .`.

**Static export**

- `output: "export"` prerenders **English** HTML; Spanish arrives only at hydration. There are deliberately no `/es/` routes and no `hreflang`/`alternates` — do not add any.
- Any anchor-targeted element needs a `scroll-mt-*` class or it lands under the sticky header. Existing values: `scroll-mt-24`, `scroll-mt-36`.

**Naming**

- Entry ids match `^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$`, are never reused or renamed (`/changelog#<id>` is a permanent link), contain no `.`, and are never literally `one` or `other` (`flattenKeys` would collapse those into a plural leaf).

**Before you start:** the repo is on `main`. Create a working branch first — `git switch -c feat/changelog`.

---

## File Structure

```
web/src/lib/
├── changelog.ts                  # CANONICAL: ChangeEntry, CHANGELOG, SILENT,
│                                 #   sortedEntries, groupByMonth, monthLabel
└── changelog-es.ts               # Spanish twin: Record<entryId, {title, body}>

web/src/app/changelog/
└── page.tsx                      # Thin route: English metadata + content component

web/src/components/changelog/
└── changelog-page-content.tsx    # "use client": header, month sections, entry cards

web/__tests__/lib/
└── changelog.test.ts             # Data integrity, BIDIRECTIONAL es parity,
                                  #   grouping, month labels, rule-13 ban list

web/__tests__/components/changelog/
└── changelog-page-content.test.tsx   # Renders in en + es, chips, ids, links

scripts/changelog/
├── rules.mjs                     # PURE: LEARNER_VISIBLE, isLearnerVisible, verdict
├── check.mjs                     # Executable: stdin -> verdict -> exit 0/1/2
└── rules.test.mjs                # node --test over rules.mjs

MODIFIED
├── web/src/components/auth/auth-wall.tsx      # + "/changelog" in PUBLIC_PATHS
├── web/src/app/sitemap.ts                     # + "/changelog" in staticPaths
├── web/src/components/footer.tsx              # + the nav link
├── web/src/i18n/locales/en.ts                 # + nav.changelog, + changelogUi group
├── web/src/i18n/locales/es.ts                 # + the same, in Spanish
├── .github/workflows/ci.yml                   # + fetch-depth: 2, + two guard steps
├── web/__tests__/app/sitemap.test.ts          # exact-array pin must move too
├── web/__tests__/components/footer.test.tsx   # + link test, rename the stale one
└── web/__tests__/components/auth-wall.test.tsx # + /changelog in the public loop
```

**Why `rules.mjs` / `check.mjs` rather than the spec's single `scripts/check-changelog.mjs`:** the pure matching logic needs unit tests, and the repo's established shape for exactly that is `scripts/founding-credit/` — `issue.mjs` (pure) + `run.mjs` (executable) + `issue.test.mjs`. The spec's risk section anticipated CI plumbing detail moving; this is that.

**Why the guard does not call git:** no script in `scripts/` shells out to git. The repo's only git assertion is a workflow shell step (`ci.yml` line 195, `git diff --exit-code -- web/jupyterlite-build/jupyter_lite_config.json`). Keeping git in the workflow follows that precedent *and* leaves `rules.mjs` testable with no repository, no network, and no fixtures.

---

## Task 1: The changelog data module, its Spanish twin, and the tests that keep them honest

**Files:**
- Create: `web/src/lib/changelog.ts`
- Create: `web/src/lib/changelog-es.ts`
- Test: `web/__tests__/lib/changelog.test.ts`

**Interfaces:**
- Consumes: `SectionSlug` from `@/lib/glossary`, `getSectionBySlug` from `@/lib/sections`.
- Produces:
  - `type ChangeKind = "new" | "improved" | "fixed"`
  - `interface ChangeEntry { id: string; shipped: string; kind: ChangeKind; title: string; body: string; href?: string; section?: SectionSlug }`
  - `interface SilentChange { pr: number; reason: string }`
  - `const CHANGELOG: readonly ChangeEntry[]`, `const SILENT: readonly SilentChange[]`
  - `const ENTRY_ID_PATTERN: RegExp`
  - `sortedEntries(entries?: readonly ChangeEntry[]): ChangeEntry[]`
  - `interface MonthGroup { key: string; entries: ChangeEntry[] }`
  - `groupByMonth(entries?: readonly ChangeEntry[]): MonthGroup[]`
  - `monthLabel(key: string, localeTag: string): string`
  - From `changelog-es.ts`: `interface ChangeEntryEs { title: string; body: string }`, `const CHANGELOG_ES: Record<string, ChangeEntryEs>`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/lib/changelog.test.ts`:

```ts
import {
  CHANGELOG,
  SILENT,
  ENTRY_ID_PATTERN,
  sortedEntries,
  groupByMonth,
  monthLabel,
  type ChangeEntry,
} from "@/lib/changelog";
import { CHANGELOG_ES } from "@/lib/changelog-es";
import { getSectionBySlug } from "@/lib/sections";

const KINDS = ["new", "improved", "fixed"];

describe("changelog data integrity", () => {
  it("gives every entry a unique, permanent, URL-safe id", () => {
    const ids = CHANGELOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !ENTRY_ID_PATTERN.test(id))).toEqual([]);
  });

  it("stamps every entry with a real, non-future ship date", () => {
    // `shipped` means visible to a learner IN PRODUCTION. No test can verify
    // that. What can be verified is that it is a real calendar date (2026-02-30
    // is not) and that nothing is announced before it exists.
    const today = new Date().toISOString().slice(0, 10);
    for (const e of CHANGELOG) {
      expect(e.shipped).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${e.shipped}T00:00:00Z`).toISOString().slice(0, 10)).toBe(e.shipped);
      expect(e.shipped.localeCompare(today)).toBeLessThanOrEqual(0);
    }
  });

  it("prefixes every id with its own ship date, so an id dates and sorts itself", () => {
    expect(CHANGELOG.filter((e) => !e.id.startsWith(`${e.shipped}-`)).map((e) => e.id)).toEqual([]);
  });

  it("is authored newest-first", () => {
    expect(CHANGELOG.map((e) => e.id)).toEqual(sortedEntries().map((e) => e.id));
  });

  it("links only to internal routes", () => {
    expect(
      CHANGELOG.filter((e) => e.href !== undefined && !e.href.startsWith("/")).map((e) => e.id),
    ).toEqual([]);
  });

  it("tags entries only with real curriculum sections", () => {
    expect(
      CHANGELOG.filter((e) => e.section && !getSectionBySlug(e.section)).map((e) => e.id),
    ).toEqual([]);
  });

  it("uses only the three learner-facing kinds", () => {
    expect(CHANGELOG.filter((e) => !KINDS.includes(e.kind)).map((e) => e.id)).toEqual([]);
  });

  it("writes in learner voice — no PR numbers, no file paths", () => {
    // This page is read by someone learning quantum computing, not by a
    // maintainer reading a diff. git already records the other version.
    for (const e of CHANGELOG) {
      const text = `${e.title} ${e.body}`;
      expect(text).not.toMatch(/#\d{2,}/);
      expect(text).not.toMatch(/\b[\w-]+\.(ts|tsx|mjs|py|json|ipynb)\b/);
    }
  });
});

describe("the SILENT ledger", () => {
  it("records a unique PR number and a real reason for every unannounced change", () => {
    const prs = SILENT.map((s) => s.pr);
    expect(new Set(prs).size).toBe(prs.length);
    for (const s of SILENT) {
      expect(Number.isInteger(s.pr)).toBe(true);
      expect(s.pr).toBeGreaterThan(0);
      expect(s.reason.trim().length).toBeGreaterThan(15);
    }
  });
});

describe("Spanish twin parity", () => {
  // BOTH directions, deliberately. The repo's only other en/es guard
  // (__tests__/lib/i18n.test.ts) computes enKeys.filter(k => !esKeys.has(k)) —
  // one-directional — so an orphaned Spanish key for a renamed id would sit
  // there forever with CI green.

  it("translates every entry", () => {
    expect(CHANGELOG.filter((e) => !CHANGELOG_ES[e.id]).map((e) => e.id)).toEqual([]);
  });

  it("carries no Spanish entry for an id that no longer exists", () => {
    const ids = new Set(CHANGELOG.map((e) => e.id));
    expect(Object.keys(CHANGELOG_ES).filter((k) => !ids.has(k))).toEqual([]);
  });

  it("gives every twin real prose, not an untranslated paste", () => {
    for (const e of CHANGELOG) {
      const es = CHANGELOG_ES[e.id];
      expect(es.title.trim().length).toBeGreaterThan(0);
      expect(es.body.trim().length).toBeGreaterThan(0);
      // Titles may legitimately coincide (a proper noun); a body of one to three
      // sentences that matches byte for byte is a paste, not a translation.
      expect(es.body).not.toBe(e.body);
    }
  });
});

describe("month grouping", () => {
  const sample: ChangeEntry[] = [
    { id: "2026-08-19-b", shipped: "2026-08-19", kind: "fixed", title: "B", body: "b" },
    { id: "2026-08-02-a", shipped: "2026-08-02", kind: "new", title: "A", body: "a" },
    { id: "2026-07-30-z", shipped: "2026-07-30", kind: "improved", title: "Z", body: "z" },
  ];

  it("groups newest month first, entries newest first inside it", () => {
    expect(groupByMonth(sample)).toEqual([
      { key: "2026-08", entries: [sample[0], sample[1]] },
      { key: "2026-07", entries: [sample[2]] },
    ]);
  });

  it("never merges the same month across different years", () => {
    const groups = groupByMonth([
      { id: "2026-08-01-x", shipped: "2026-08-01", kind: "new", title: "X", body: "x" },
      { id: "2025-08-01-y", shipped: "2025-08-01", kind: "new", title: "Y", body: "y" },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-08", "2025-08"]);
  });

  it("formats the month heading per locale — word order and case included", () => {
    // en-US "August 2026" vs es-MX "agosto de 2026": different word order AND
    // different capitalization. This is exactly why the label comes from Intl
    // and is never capitalized by hand with charAt(0).toUpperCase().
    expect(monthLabel("2026-08", "en-US")).toBe("August 2026");
    expect(monthLabel("2026-08", "es-MX")).toBe("agosto de 2026");
  });

  it("reads the month from the date string, never from a local-time Date", () => {
    // new Date("2026-08-01") is midnight UTC; formatting it west of UTC without
    // timeZone: "UTC" yields July. A changelog that files an entry under the
    // wrong month depending on the reader's clock is worse than no grouping.
    expect(monthLabel("2026-01", "en-US")).toBe("January 2026");
    expect(monthLabel("2026-12", "en-US")).toBe("December 2026");
  });
});

describe("rule 13 — the page may not advertise what the deployed system cannot do", () => {
  // A BAN list, deliberately not a presence assertion. The 2026-08-17 audit
  // established that locking a promise's PRESENCE in a test is exactly how a
  // withdrawn promise outlived its withdrawal. Re-verify these when the
  // storefront opens; do not delete them.
  const BANNED: { pattern: RegExp; why: string }[] = [
    {
      pattern: /\bbuy (credits|a plan|a subscription)\b/i,
      why: "the storefront is closed — no NEXT_PUBLIC_BILLING_URL in the live env",
    },
    {
      pattern: /\bcomprar? (créditos|un plan|una suscripción)\b/i,
      why: "the storefront is closed (Spanish)",
    },
    {
      pattern: /\brun (it |them )?on (real|actual) (quantum )?hardware\b/i,
      why: "LIFETIME_CAP_MICROS is 0 — no learner can run a QPU task",
    },
    {
      pattern: /\bejecutar? .{0,20}en hardware (real|cuántico)\b/i,
      why: "no learner can run a QPU task (Spanish)",
    },
    { pattern: /sponsor\w*/i, why: "the sponsored-QPU promise was withdrawn 2026-08-17" },
    { pattern: /patrocin\w*/i, why: "the sponsored-QPU promise was withdrawn (Spanish)" },
  ];

  // A denylist over raw text cannot see a negation, and the pricing page's guard
  // documents two real sentences that were honest and still matched. Narrow the
  // hit to affirmative constructions: ignore a match with a negation earlier in
  // the same sentence. A heuristic, and better than none.
  const NEGATION = /\b(no|not|never|cannot|can't|without|nunca|sin|tampoco|todavía no|aún no)\b/i;

  function affirmativeHit(text: string, pattern: RegExp): boolean {
    const m = pattern.exec(text);
    if (!m) return false;
    const sentenceStart = text.lastIndexOf(".", m.index) + 1;
    return !NEGATION.test(text.slice(sentenceStart, m.index));
  }

  function allCopy(): { label: string; text: string }[] {
    const rows: { label: string; text: string }[] = [];
    for (const e of CHANGELOG) {
      rows.push({ label: `${e.id} (en title)`, text: e.title });
      rows.push({ label: `${e.id} (en body)`, text: e.body });
    }
    for (const [id, v] of Object.entries(CHANGELOG_ES)) {
      rows.push({ label: `${id} (es title)`, text: v.title });
      rows.push({ label: `${id} (es body)`, text: v.body });
    }
    return rows;
  }

  it("scans both locales, and fails loudly if it is ever scanning nothing", () => {
    // Non-vacuity. If the data modules are restructured so this scan reads an
    // empty list, that must fail rather than pass green over zero strings —
    // the exact failure mode the pricing metadata guard was written to close.
    expect(allCopy()).toHaveLength(CHANGELOG.length * 2 + Object.keys(CHANGELOG_ES).length * 2);
    expect(allCopy().length).toBeGreaterThan(0);
  });

  it.each(BANNED)("never claims what it cannot deliver: $why", ({ pattern }) => {
    expect(allCopy().filter((r) => affirmativeHit(r.text, pattern)).map((r) => r.label)).toEqual([]);
  });

  it("still catches an affirmative claim (the guard is not inert)", () => {
    expect(affirmativeHit("You can buy credits today.", BANNED[0].pattern)).toBe(true);
    expect(affirmativeHit("You cannot buy credits yet.", BANNED[0].pattern)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx jest __tests__/lib/changelog.test.ts`
Expected: FAIL — `Cannot find module '@/lib/changelog' from '__tests__/lib/changelog.test.ts'`

- [ ] **Step 3: Write `web/src/lib/changelog.ts`**

```ts
import type { SectionSlug } from "@/lib/glossary";

/**
 * The learner-facing record of what changed in Quantum Learner.
 *
 * English is canonical and carries the structure; changelog-es.ts holds the
 * Spanish twin, keyed by entry id. Two rules this file exists to hold:
 *
 *  - `shipped` means VISIBLE TO A LEARNER IN PRODUCTION, not merged. For web
 *    changes the two coincide (Amplify deploys from main); for the Lambdas they
 *    do not. No test can check this — the field name is the whole enforcement.
 *  - Never announce a surface the deployed system does not expose. The repo is
 *    public and this page is indexed, so an entry here is a rule 13 claim with
 *    SEO reach. The ban list lives in __tests__/lib/changelog.test.ts.
 *
 * The record is forward-only. It begins at its first entry and makes no claim
 * about anything before that date; the page's lede says so.
 */

/** new = new stuff · improved = refinements · fixed = fixes */
export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangeEntry {
  /**
   * Stable, URL-safe, NEVER reused or renamed: `/changelog#<id>` is a permanent
   * deep link and the Spanish twin is keyed by it. Convention: the ship date,
   * then a short slug.
   *
   * Note the id begins with a digit. That is a valid HTML id and a valid URL
   * fragment, but an INVALID bare CSS selector — reach these elements with
   * getElementById, never querySelector("#" + id).
   */
  id: string;
  /** ISO yyyy-mm-dd. See the note above — production, not merge. */
  shipped: string;
  kind: ChangeKind;
  /** One line, learner voice. No PR numbers, no file paths, no jargon. */
  title: string;
  /** One to three sentences: what changed, and what it means for them. */
  body: string;
  /** Optional internal route to go and see it. Must start with "/". */
  href?: string;
  /** Optional curriculum section, reusing the glossary's slug union. */
  section?: SectionSlug;
}

/** Entry ids are permanent deep links, so their shape is pinned by a test. */
export const ENTRY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

/** Newest first, as authored. A test asserts the ordering. */
export const CHANGELOG: readonly ChangeEntry[] = [
  {
    id: "2026-08-19-grover-amplification",
    shipped: "2026-08-19",
    kind: "fixed",
    title: "Grover's search now amplifies correctly at four qubits and above",
    body: "The oracle and diffusion steps quietly did nothing on circuits larger than three qubits, so the algorithm returned an even spread instead of finding the marked item. Both now build the correct operation at any size, and the Algorithms lesson demonstrates real amplification.",
    href: "/learn/03-algorithms",
    section: "03-algorithms",
  },
];

export interface SilentChange {
  pr: number;
  reason: string;
}

/**
 * Learner-visible paths changed WITHOUT an announcement, and why.
 *
 * scripts/changelog/ requires every learner-path pull request to touch THIS
 * file. A change nobody should hear about — an internal refactor, a test-only
 * edit that happened to sit under a watched directory — satisfies the guard by
 * landing here. That is deliberately more work than a magic string in a PR
 * description, and deliberately reviewable: the decision NOT to announce ends
 * up in version control next to the decisions to announce.
 */
export const SILENT: readonly SilentChange[] = [];

/** Newest first. Ties keep their authored order. */
export function sortedEntries(entries: readonly ChangeEntry[] = CHANGELOG): ChangeEntry[] {
  return [...entries].sort((a, b) =>
    a.shipped < b.shipped ? 1 : a.shipped > b.shipped ? -1 : 0,
  );
}

export interface MonthGroup {
  /** "2026-08" — a sort key and a stable React key, never display text. */
  key: string;
  entries: ChangeEntry[];
}

/** Group newest-first entries into newest-first months. */
export function groupByMonth(entries: readonly ChangeEntry[] = CHANGELOG): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of sortedEntries(entries)) {
    const key = entry.shipped.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }
  return groups;
}

/**
 * Display heading for a month group, e.g. "August 2026" / "agosto de 2026".
 *
 * Takes a BCP 47 tag (feed it localeCode(locale)), and formats at UTC because
 * "2026-08-01" parses as midnight UTC — formatting it west of UTC without this
 * would file the group under July. The two locales differ in word order AND in
 * capitalization, so never post-process the result by hand.
 */
export function monthLabel(key: string, localeTag: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(localeTag, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
```

- [ ] **Step 4: Write `web/src/lib/changelog-es.ts`**

```ts
/**
 * Spanish twins for the changelog, keyed by ChangeEntry.id (see changelog.ts).
 *
 * Every id in CHANGELOG must appear here, and nothing else may — asserted in
 * BOTH directions by __tests__/lib/changelog.test.ts. The repo's other en/es
 * guard (__tests__/lib/i18n.test.ts) checks en ⊆ es only, which would let an
 * orphan for a renamed id sit here forever with CI green.
 *
 * A missing key does NOT fall back through the dictionary — this is a plain
 * Record, not a TranslationDict. The page falls back to the English entry
 * explicitly; the parity test is what keeps that path unused.
 */

export interface ChangeEntryEs {
  title: string;
  body: string;
}

export const CHANGELOG_ES: Record<string, ChangeEntryEs> = {
  "2026-08-19-grover-amplification": {
    title: "La búsqueda de Grover ahora amplifica correctamente con cuatro cúbits o más",
    body: "Los pasos de oráculo y difusión no hacían nada en circuitos de más de tres cúbits, así que el algoritmo devolvía una distribución uniforme en lugar de encontrar el elemento marcado. Ambos construyen ahora la operación correcta en cualquier tamaño, y la lección de Algoritmos demuestra una amplificación real.",
  },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && npx jest __tests__/lib/changelog.test.ts`
Expected: PASS — all suites green.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/changelog.ts web/src/lib/changelog-es.ts web/__tests__/lib/changelog.test.ts
git commit -m "feat(changelog): the entry model, its Spanish twin, and a bidirectional parity guard"
```

---

## Task 2: The page content component and its localized copy

**Files:**
- Create: `web/src/components/changelog/changelog-page-content.tsx`
- Modify: `web/src/i18n/locales/en.ts` (add a `changelogUi` group beside the other `*Ui` groups at the end of the file)
- Modify: `web/src/i18n/locales/es.ts` (the same group, same key order)
- Test: `web/__tests__/components/changelog/changelog-page-content.test.tsx`

**Interfaces:**
- Consumes: `CHANGELOG`, `groupByMonth`, `monthLabel`, `ChangeEntry`, `ChangeKind` from `@/lib/changelog`; `CHANGELOG_ES` from `@/lib/changelog-es`; `useLocale`, `localeCode` from `@/i18n`.
- Produces: `export function ChangelogPageContent(props?: { entries?: readonly ChangeEntry[] }): JSX.Element`. The prop exists so the empty state is reachable in a test; the route passes nothing and the default is `CHANGELOG`. It mirrors the default-parameter idiom already used by `groupByMonth`/`sortedEntries`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/components/changelog/changelog-page-content.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { ChangelogPageContent } from "@/components/changelog/changelog-page-content";
import { LocaleProvider } from "@/i18n";
import { CHANGELOG, type ChangeEntry } from "@/lib/changelog";
import { CHANGELOG_ES } from "@/lib/changelog-es";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

function renderChangelog(locale: "en" | "es" = "en", entries?: ChangeEntry[]) {
  localStorage.setItem("qc:locale", locale);
  return render(
    <LocaleProvider>
      <ChangelogPageContent entries={entries} />
    </LocaleProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("ChangelogPageContent", () => {
  it("renders every entry's English title", () => {
    renderChangelog("en");
    for (const entry of CHANGELOG) {
      expect(screen.getByText(entry.title)).toBeInTheDocument();
    }
  });

  it("renders the Spanish twin, not the English text, in Spanish", () => {
    // useLocale() falls back to a working English-only value with no provider,
    // so an en-only test passes while asserting nothing about localization.
    renderChangelog("es");
    for (const entry of CHANGELOG) {
      expect(screen.getByText(CHANGELOG_ES[entry.id].body)).toBeInTheDocument();
      expect(screen.queryByText(entry.body)).not.toBeInTheDocument();
    }
  });

  it("gives every entry a heading carrying its id, so #<id> resolves forever", () => {
    renderChangelog("en");
    for (const entry of CHANGELOG) {
      // getElementById, NOT querySelector: ids begin with a digit, which is a
      // valid HTML id but an invalid bare CSS selector — and jsdom does not
      // implement CSS.escape (verified), so the escaping workaround throws.
      const el = document.getElementById(entry.id);
      expect(el).not.toBeNull();
      // Anchored elements must clear the sticky header.
      expect(el).toHaveClass("scroll-mt-24");
    }
  });

  it("labels each entry with its kind, localized", () => {
    renderChangelog("en");
    const labels = CHANGELOG.map((e) => ({ new: "New", improved: "Improved", fixed: "Fixed" })[e.kind]);
    for (const label of new Set(labels)) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it.each(["en", "es"] as const)("heads each month group with a localized date in %s", (locale) => {
    renderChangelog(locale);
    const expected = locale === "en" ? "August 2026" : "agosto de 2026";
    expect(screen.getByRole("heading", { name: expected })).toBeInTheDocument();
  });

  it("links an entry to the place you can go and see it", () => {
    renderChangelog("en");
    const withHref = CHANGELOG.filter((e) => e.href);
    for (const entry of withHref) {
      const article = document.getElementById(entry.id)!.closest("article")!;
      const link = within(article as HTMLElement).getByRole("link");
      expect(link).toHaveAttribute("href", entry.href!);
    }
  });

  it.each(["en", "es"] as const)("states in %s that the record starts here", (locale) => {
    // Forward-only: the page backfills nothing, so a two-entry list must read as
    // deliberate rather than abandoned. The lede is the only thing that does that.
    const { container } = renderChangelog(locale);
    const lede = container.querySelector("header p:last-of-type");
    expect(lede?.textContent?.length ?? 0).toBeGreaterThan(40);
  });

  it("says so plainly when there is nothing to show", () => {
    // Reachable only through the prop. Entries are never deleted, so the live
    // page will not hit this — but an untested branch behind a shipped i18n
    // string is how dead copy accumulates.
    renderChangelog("en", []);
    expect(screen.getByText(/nothing has shipped/i)).toBeInTheDocument();
  });

  it("renders no emoji anywhere", () => {
    const { container } = renderChangelog("en");
    expect(container.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx jest __tests__/components/changelog`
Expected: FAIL — `Cannot find module '@/components/changelog/changelog-page-content'`

- [ ] **Step 3: Add the `changelogUi` group to `web/src/i18n/locales/en.ts`**

Add `changelog: "Changelog",` to the existing `nav:` group (after `glossary: "Glossary",`), and add this group at the end of the file, beside the other `*Ui` groups, immediately before the file's closing `};`:

```ts
  changelogUi: {
    eyebrow: "What's new",
    title: "Changelog",
    lead: "Every change a learner can see, newest first. The record starts here — earlier work is not listed, and nothing is announced before it is live.",
    kindNew: "New",
    kindImproved: "Improved",
    kindFixed: "Fixed",
    kindLabel: "Type of change",
    seeIt: "Go and see it",
    empty: "Nothing has shipped since this page began. Check back soon.",
  },
```

- [ ] **Step 4: Add the same group to `web/src/i18n/locales/es.ts`**

Add `changelog: "Novedades",` to the `nav:` group in the same position, and this group before the file's closing `};` — same keys, same order:

```ts
  changelogUi: {
    eyebrow: "Novedades",
    title: "Registro de cambios",
    lead: "Cada cambio que un estudiante puede ver, del más reciente al más antiguo. El registro empieza aquí: el trabajo anterior no aparece, y nada se anuncia antes de estar en línea.",
    kindNew: "Nuevo",
    kindImproved: "Mejorado",
    kindFixed: "Corregido",
    kindLabel: "Tipo de cambio",
    seeIt: "Ir a verlo",
    empty: "Nada se ha publicado desde que empezó esta página. Vuelve pronto.",
  },
```

- [ ] **Step 5: Write `web/src/components/changelog/changelog-page-content.tsx`**

```tsx
"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useLocale, localeCode } from "@/i18n";
import {
  CHANGELOG,
  groupByMonth,
  monthLabel,
  type ChangeEntry,
  type ChangeKind,
} from "@/lib/changelog";
import { CHANGELOG_ES } from "@/lib/changelog-es";

const KIND_LABEL_KEY: Record<ChangeKind, string> = {
  new: "changelogUi.kindNew",
  improved: "changelogUi.kindImproved",
  fixed: "changelogUi.kindFixed",
};

// Hues from the curriculum palette (lib/sections.ts sectionHue), so the chips
// sit inside the product's existing colour language rather than introducing a
// second one. The chip itself is the same hue-soft-bg/hue-text pair the
// glossary's CategoryChip uses.
const KIND_HUE: Record<ChangeKind, number> = { new: 160, improved: 192, fixed: 15 };

export function ChangelogPageContent({
  entries = CHANGELOG,
}: {
  /** Defaults to CHANGELOG. Present so the empty state is reachable in a test. */
  entries?: readonly ChangeEntry[];
} = {}) {
  const { t, locale } = useLocale();
  const tag = localeCode(locale);
  const groups = groupByMonth(entries);

  // A plain Record has no dictionary fallback chain, so an unmatched id would
  // render nothing at all. Fall back to English explicitly; the bidirectional
  // parity test in __tests__/lib/changelog.test.ts keeps this path unused.
  const copy = (entry: ChangeEntry) =>
    locale === "es" ? (CHANGELOG_ES[entry.id] ?? { title: entry.title, body: entry.body }) : entry;

  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <header className="mb-12">
        <p className="mb-4 text-sm font-medium tracking-widest uppercase text-accent-dark dark:text-accent-light">
          {t("changelogUi.eyebrow")}
        </p>
        <h1 className="font-display text-display-2xl tracking-tight text-(--ink)">
          {t("changelogUi.title")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-gray-400">
          {t("changelogUi.lead")}
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-gray-500 dark:text-gray-400">
          {t("changelogUi.empty")}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-labelledby={`month-${group.key}`} className="mt-10">
            <h2
              id={`month-${group.key}`}
              className="scroll-mt-24 font-display text-display-lg tabular-nums text-accent-dark dark:text-accent-light"
            >
              {monthLabel(group.key, tag)}
            </h2>

            <ul role="list" className="mt-2">
              {group.entries.map((entry) => {
                const { title, body } = copy(entry);
                return (
                  <li key={entry.id}>
                    <article className="border-b border-gray-200/50 py-5 dark:border-white/[0.06]">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                        <h3
                          id={entry.id}
                          className="scroll-mt-24 font-display text-display-md tracking-tight text-(--ink)"
                        >
                          {title}
                        </h3>
                        <span
                          style={{ "--hue": KIND_HUE[entry.kind] } as CSSProperties}
                          className="hue-soft-bg hue-text rounded-chip px-2 py-0.5 text-xs font-medium"
                        >
                          {t(KIND_LABEL_KEY[entry.kind])}
                        </span>
                      </div>

                      <p className="mt-2 leading-relaxed text-gray-600 dark:text-gray-300">{body}</p>

                      {entry.href ? (
                        <Link
                          href={entry.href}
                          className="interactive focus-ring mt-3 inline-block rounded text-sm font-medium text-accent-dark hover:underline dark:text-accent-light"
                        >
                          {t("changelogUi.seeIt")}
                        </Link>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd web && npx jest __tests__/components/changelog __tests__/lib/i18n.test.ts`
Expected: PASS — including `dictionary completeness`, which now covers the new keys in both locales.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/changelog web/src/i18n/locales/en.ts web/src/i18n/locales/es.ts web/__tests__/components/changelog
git commit -m "feat(changelog): the page body — month groups, kind chips, both locales"
```

---

## Task 3: The public `/changelog` route

**Files:**
- Create: `web/src/app/changelog/page.tsx`
- Modify: `web/src/components/auth/auth-wall.tsx:8-19` (docblock + `PUBLIC_PATHS`)
- Modify: `web/src/app/sitemap.ts:20` (`staticPaths`)
- Test: `web/__tests__/app/sitemap.test.ts` (the exact-array pin)
- Test: `web/__tests__/components/auth-wall.test.tsx:39` (the public-path loop)

**Interfaces:**
- Consumes: `ChangelogPageContent` from Task 2, `SITE_NAME` from `@/lib/site`.
- Produces: default-exported `ChangelogPage` and a named `metadata` export, both importable by tests as `import ChangelogPage, { metadata } from "@/app/changelog/page"`.

**Why one task:** omitting `/changelog` from `PUBLIC_PATHS` produces no build error and no failing test — `AuthWall` is inert whenever auth status is `"unconfigured"`, which is the state in every unit test, in local dev, and in any static export without Cognito env. The failure appears only in the configured production build, as a redirect to `/login?mode=signup&next=%2Fchangelog`. Shipping the route without the wall entry ships exactly that bug.

- [ ] **Step 1: Write the failing tests**

Add to `web/__tests__/app/sitemap.test.ts`, inside the existing `describe("sitemap", ...)`:

```ts
  it("advertises the changelog — it is public, and it is the freshness signal", () => {
    expect(sitemap().map((e) => e.url)).toContain(`${SITE_URL}/changelog`);
  });
```

And update the exact-array pin in the same file. `staticPaths` emits before the derived badge paths, so the new entry sits after `/founding-ten`:

```ts
    expect(urls).toEqual([
      `${SITE_URL}`,
      `${SITE_URL}/pricing`,
      `${SITE_URL}/privacy`,
      `${SITE_URL}/founding-ten`,
      `${SITE_URL}/changelog`,
      `${SITE_URL}/founding-ten/charter-01`,
    ]);
```

Add to `web/__tests__/components/auth-wall.test.tsx` — a test of its own rather than an extra string in the existing loop, because adding to `PUBLIC_PATHS` does not fail any existing test and the route's public-ness must be proven deliberately:

```ts
  it("leaves /changelog public — a signed-out visitor is exactly who it is for", () => {
    mockPathname = "/changelog";
    renderWall();
    expect(screen.getByText(CHILD)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
```

Create `web/__tests__/app/changelog-page.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import ChangelogPage, { metadata } from "@/app/changelog/page";
import { LocaleProvider } from "@/i18n";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

afterEach(() => {
  localStorage.clear();
});

describe("ChangelogPage", () => {
  it("carries honest, indexable metadata", () => {
    expect(metadata.title).toMatch(/changelog/i);
    expect(String(metadata.description ?? "")).not.toHaveLength(0);
  });

  it("is not marked noindex — unlike the walled glossary, this page is public", () => {
    // app/glossary/page.tsx sets robots: { index: false, follow: false } because
    // it sits behind the sign-up wall. Cloning that file would silently
    // de-index the one page whose job is to be found.
    expect(metadata.robots).toBeUndefined();
  });

  it("renders the changelog", () => {
    localStorage.setItem("qc:locale", "en");
    render(
      <LocaleProvider>
        <ChangelogPage />
      </LocaleProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Changelog" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx jest __tests__/app/changelog-page.test.tsx __tests__/app/sitemap.test.ts __tests__/components/auth-wall.test.tsx`
Expected: FAIL — module not found for the page; sitemap array mismatch; auth-wall redirect on `/changelog`.

- [ ] **Step 3: Write `web/src/app/changelog/page.tsx`**

```tsx
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { ChangelogPageContent } from "@/components/changelog/changelog-page-content";

export const metadata: Metadata = {
  title: `Changelog — ${SITE_NAME}`,
  description: `What is new, what got better, and what got fixed in ${SITE_NAME} — every change a learner can see, newest first.`,
};

/**
 * The public record of what changed. Body copy is localized in
 * ChangelogPageContent; metadata stays English for SEO (public funnel).
 *
 * Deliberately NOT marked noindex, unlike the walled pages: a changelog nobody
 * can find is not a freshness signal. It is registered in PUBLIC_PATHS
 * (components/auth/auth-wall.tsx) and in the sitemap, and those two must always
 * agree — advertising a walled route only sends crawlers into a redirect.
 */
export default function ChangelogPage() {
  return <ChangelogPageContent />;
}
```

- [ ] **Step 4: Add `/changelog` to `PUBLIC_PATHS`**

In `web/src/components/auth/auth-wall.tsx`, extend the docblock and the set:

```ts
/**
 * Routes that never require an account. The marketing funnel (`/`, `/pricing`)
 * is the conversion surface; the auth routes (`/login`, `/auth/callback`) would
 * loop if gated; `/privacy` is legal and must always be reachable; `/changelog`
 * is the public record of what shipped, and a changelog only signals a living
 * product if a prospective learner can read it; the `/e2e-fixtures/*` pages are
 * Playwright scaffolding. Everything else — the whole learning platform — sits
 * behind the sign-up wall.
 *
 * `/founding-ten/*` is proof of record: a third party verifying a holder's
 * credential must reach it without an account, so it cannot sit behind the wall.
 */
const PUBLIC_PATHS = new Set([
  "/",
  "/pricing",
  "/login",
  "/auth/callback",
  "/privacy",
  "/changelog",
]);
```

Leave `PUBLIC_PREFIXES` alone. `/changelog` has no children, and a prefix entry would silently open every future `/changelog/*` route too.

- [ ] **Step 5: Add `/changelog` to the sitemap**

In `web/src/app/sitemap.ts`, change the `staticPaths` line and extend the comment above it:

```ts
  // /changelog is public for the same reason: it is the freshness signal a
  // prospective learner checks, and it is registered in auth-wall.tsx's
  // PUBLIC_PATHS. These two lists must always move together — advertising a
  // walled route would only send crawlers into a redirect.
  const staticPaths = ["", "/pricing", "/privacy", "/founding-ten", "/changelog"];
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd web && npx jest __tests__/app/changelog-page.test.tsx __tests__/app/sitemap.test.ts __tests__/components/auth-wall.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/changelog web/src/app/sitemap.ts web/src/components/auth/auth-wall.tsx web/__tests__/app/changelog-page.test.tsx web/__tests__/app/sitemap.test.ts web/__tests__/components/auth-wall.test.tsx
git commit -m "feat(changelog): publish /changelog — public, indexed, and outside the sign-up wall"
```

---

## Task 4: The footer link

**Files:**
- Modify: `web/src/components/footer.tsx:41-47` (insert after the Glossary link)
- Test: `web/__tests__/components/footer.test.tsx` (add a test, rename the stale one)

**Interfaces:**
- Consumes: `nav.changelog` from the dictionaries (added in Task 2).
- Produces: nothing importable.

- [ ] **Step 1: Write the failing test**

In `web/__tests__/components/footer.test.tsx`, add after the glossary test:

```tsx
  it("links to the changelog", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Changelog" })).toHaveAttribute("href", "/changelog");
  });
```

And rename the wrap test — its assertion still passes with a ninth link, so the name is the only thing that goes stale, and a stale name is a test that lies:

```tsx
  it("lets the nav row wrap so nine links fit on narrow viewports", () => {
    render(<Footer />);
    const nav = screen.getByRole("navigation", { name: "Footer" });
    expect(nav).toHaveClass("flex-wrap");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx jest __tests__/components/footer.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "link" and name "Changelog"`

- [ ] **Step 3: Add the link**

In `web/src/components/footer.tsx`, insert between the Glossary and Review links:

```tsx
          <Link href="/changelog" className={linkClass}>
            {t("nav.changelog")}
          </Link>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx jest __tests__/components/footer.test.tsx`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/footer.tsx web/__tests__/components/footer.test.tsx
git commit -m "feat(changelog): link the changelog from the site footer"
```

---

## Task 5: The guard

**Files:**
- Create: `scripts/changelog/rules.mjs`
- Create: `scripts/changelog/check.mjs`
- Test: `scripts/changelog/rules.test.mjs`

**Interfaces:**
- Consumes: nothing. `node:` builtins only — there is no root `package.json` and the `web` CI job installs only `web/node_modules`.
- Produces (from `rules.mjs`):
  - `const LEARNER_VISIBLE: string[]`
  - `const CHANGELOG_FILE: string`
  - `isLearnerVisible(path: string): boolean`
  - `verdict(paths: string[]): { ok: boolean, reason: "no-diff" | "no-learner-paths" | "changelog-touched" | "unannounced", offenders: string[] }`

- [ ] **Step 1: Write the failing test**

Create `scripts/changelog/rules.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verdict, isLearnerVisible, LEARNER_VISIBLE, CHANGELOG_FILE } from "./rules.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("a pull request touching nothing learner-visible needs no changelog edit", () => {
  const v = verdict(["lambda/stripe/index.mjs", "docs/pricing-cost-basis.md", "Makefile"]);
  assert.equal(v.ok, true);
  assert.equal(v.reason, "no-learner-paths");
});

test("a learner-visible change with no changelog edit is refused", () => {
  const v = verdict(["web/src/components/footer.tsx"]);
  assert.equal(v.ok, false);
  assert.equal(v.reason, "unannounced");
  assert.deepEqual(v.offenders, ["web/src/components/footer.tsx"]);
});

test("touching the changelog satisfies the guard", () => {
  const v = verdict(["web/src/components/footer.tsx", CHANGELOG_FILE]);
  assert.equal(v.ok, true);
  assert.equal(v.reason, "changelog-touched");
});

test("the Spanish twin alone does NOT satisfy it", () => {
  // CHANGELOG and SILENT both live in changelog.ts, so that is the file which
  // must move under either outcome. Accepting the twin would let a translation
  // edit satisfy a guard about announcements.
  const v = verdict(["web/src/components/footer.tsx", "web/src/lib/changelog-es.ts"]);
  assert.equal(v.ok, false);
  assert.equal(v.reason, "unannounced");
});

test("an empty diff is a wiring fault, never a pass", () => {
  // A shallow clone with no merge base produces no paths. Treating that as a
  // pass would switch the guard off silently for every pull request, and
  // nothing would ever report it.
  assert.equal(verdict([]).reason, "no-diff");
  assert.equal(verdict([""]).reason, "no-diff");
  assert.equal(verdict(["", "   "]).reason, "no-diff");
  assert.equal(verdict([]).ok, false);
});

test("curriculum notebooks, guides and scripts are learner-visible", () => {
  for (const p of [
    "03-algorithms/notebooks/02-grover-search.ipynb",
    "03-algorithms/GUIDE.md",
    "03-algorithms/GUIDE.es.md",
    "03-algorithms/scripts/oracles.py",
    "00-prereqs/notebooks/01-python.ipynb",
    "web/src/app/pricing/page.tsx",
    "web/src/components/footer.tsx",
    "web/src/i18n/locales/es.ts",
    "web/src/lib/glossary.ts",
    "web/src/lib/glossary-es.ts",
  ]) {
    assert.equal(isLearnerVisible(p), true, p);
  }
});

test("tests, infra, docs, scripts and the Lambdas are not learner-visible", () => {
  for (const p of [
    "web/__tests__/components/footer.test.tsx",
    "tests/test_oracles.py",
    "docs/superpowers/specs/2026-08-19-changelog-design.md",
    "lambda/qpu/qpu-core.mjs",
    "infra/template.yaml",
    ".github/workflows/ci.yml",
    "scripts/changelog/rules.mjs",
    "web/src/lib/pricing.ts",
    "web/src/i18n/translate.ts",
    "Makefile",
  ]) {
    assert.equal(isLearnerVisible(p), false, p);
  }
});

test("a directory prefix never matches a sibling that merely starts the same way", () => {
  assert.equal(isLearnerVisible("web/src/app-shell/thing.ts"), false);
  assert.equal(isLearnerVisible("web/src/components-legacy/x.tsx"), false);
  assert.equal(isLearnerVisible("web/src/libs/glossary.ts"), false);
  assert.equal(isLearnerVisible("01-foundations-old/GUIDE.md"), false);
});

test("every watched path still exists in the repo it guards", () => {
  // A renamed or deleted directory would silently narrow the guard toward
  // watching nothing, while continuing to pass every run. Asserted against the
  // real tree, the way scripts/founding-credit/issue.test.mjs asserts against
  // the shipped roster rather than only synthetic fixtures.
  for (const p of LEARNER_VISIBLE) {
    assert.ok(existsSync(join(REPO, p)), `LEARNER_VISIBLE entry no longer exists: ${p}`);
  }
  assert.ok(existsSync(join(REPO, CHANGELOG_FILE)), `missing: ${CHANGELOG_FILE}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/changelog/rules.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/changelog/rules.mjs'`

- [ ] **Step 3: Write `scripts/changelog/rules.mjs`**

```js
/**
 * Which paths are learner-visible, and does a diff owe the changelog an entry?
 *
 * Pure and dependency-free so rules.test.mjs can exercise it with no git, no
 * network and no node_modules — there is no package.json at the repo root and
 * the web CI job installs only web/node_modules.
 */

/**
 * A change under one of these is something a learner could see.
 *
 * Deliberately a literal list rather than configuration: widening it is a
 * decision, and a decision belongs in a diff. Trailing "/" means directory
 * prefix; anything else is an exact path.
 *
 * No test-file exclusions are needed, and that was checked rather than assumed:
 * there are zero colocated *.test.ts(x) files under web/src (every web test
 * lives in web/__tests__, outside these roots), and the seven curriculum
 * directories hold only notebooks/, scripts/, GUIDE.md and GUIDE.es.md. Add an
 * exclusion here if colocated tests are ever introduced.
 */
export const LEARNER_VISIBLE = [
  "web/src/app/",
  "web/src/components/",
  "web/src/i18n/locales/",
  "web/src/lib/glossary.ts",
  "web/src/lib/glossary-es.ts",
  "00-prereqs/",
  "01-foundations/",
  "02-hardware/",
  "03-algorithms/",
  "04-quantum-ml/",
  "05-quantum-chemistry/",
  "06-hybrid-jobs/",
];

/**
 * The one file a learner-visible pull request must touch.
 *
 * Not changelog-es.ts: CHANGELOG and SILENT both live here, so this is the file
 * that moves under either outcome, and accepting the twin would let a
 * translation edit satisfy a guard about announcements.
 */
export const CHANGELOG_FILE = "web/src/lib/changelog.ts";

export function isLearnerVisible(path) {
  return LEARNER_VISIBLE.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

/**
 * @param {string[]} paths repo-relative paths changed by the pull request
 * @returns {{ok: boolean, reason: string, offenders: string[]}}
 */
export function verdict(paths) {
  const changed = paths.map((p) => p.trim()).filter(Boolean);
  if (changed.length === 0) return { ok: false, reason: "no-diff", offenders: [] };

  const offenders = changed.filter(isLearnerVisible);
  if (offenders.length === 0) return { ok: true, reason: "no-learner-paths", offenders: [] };
  if (changed.includes(CHANGELOG_FILE)) {
    return { ok: true, reason: "changelog-touched", offenders };
  }
  return { ok: false, reason: "unannounced", offenders };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/changelog/rules.test.mjs`
Expected: PASS — 9 tests, 0 fail.

- [ ] **Step 5: Write `scripts/changelog/check.mjs`**

```js
#!/usr/bin/env node
/**
 * Did this pull request change something a learner can see without saying so?
 *
 * Reads the changed-file list on STDIN, one repo-relative path per line. git is
 * deliberately NOT invoked here: the repo's only other git assertion is a
 * workflow shell step (ci.yml's committed-lab-config pin), no script under
 * scripts/ shells out to git, and keeping git in the workflow is what leaves
 * rules.mjs unit-testable without a repository.
 *
 *   git diff --name-only HEAD^1 HEAD | node scripts/changelog/check.mjs
 *
 * Usage:  node scripts/changelog/check.mjs  < list-of-paths
 * Exit:   0 = fine (nothing learner-visible, or the changelog moved)
 *         1 = a learner-visible change with no changelog edit
 *         2 = could not check (empty stdin — never true of a real pull request)
 */
import { verdict, CHANGELOG_FILE } from "./rules.mjs";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

const result = verdict(input.split("\n"));

if (result.reason === "no-diff") {
  console.log("\n  Changelog guard: received an EMPTY diff on stdin.");
  console.log("  A pull request always changes at least one file, so this is a");
  console.log("  wiring fault — a shallow clone with no merge base, or the wrong");
  console.log("  ref — and not a clean result. Refusing to report a pass.\n");
  process.exit(2);
}

if (result.ok) {
  console.log(
    result.reason === "no-learner-paths"
      ? "\n  Changelog guard: nothing learner-visible in this diff.\n"
      : `\n  Changelog guard: ${result.offenders.length} learner-visible path(s), and ${CHANGELOG_FILE} moved.\n`,
  );
  process.exit(0);
}

console.log("\n  Changelog guard: this pull request changes what a learner sees,");
console.log("  and says nothing about it.\n");
for (const path of result.offenders) console.log(`    ${path}`);
console.log(`\n  Edit ${CHANGELOG_FILE} — one of two ways:\n`);
console.log("    1. Announce it. Add a CHANGELOG entry, and its Spanish twin in");
console.log("       web/src/lib/changelog-es.ts. Both are required to merge.");
console.log("    2. Or record that it needs no announcement, by appending to SILENT:");
console.log('         { pr: <number>, reason: "<why a learner cannot see this>" }\n');
console.log("  There is no bypass flag. Not announcing is a decision, and a");
console.log("  decision belongs in the diff where a reviewer can see it.\n");
process.exit(1);
```

- [ ] **Step 6: Exercise the executable for real, all three exits**

Run each and check `$?`:

```bash
printf 'web/src/components/footer.tsx\n' | node scripts/changelog/check.mjs; echo "exit=$?"
printf 'web/src/components/footer.tsx\nweb/src/lib/changelog.ts\n' | node scripts/changelog/check.mjs; echo "exit=$?"
printf 'lambda/qpu/qpu-core.mjs\n' | node scripts/changelog/check.mjs; echo "exit=$?"
printf '' | node scripts/changelog/check.mjs; echo "exit=$?"
```

Expected: `exit=1`, `exit=0`, `exit=0`, `exit=2` — in that order, each with its message.

- [ ] **Step 7: Commit**

```bash
git add scripts/changelog
git commit -m "feat(changelog): the guard — a learner-visible PR must announce or record silence"
```

---

## Task 6: Wire the guard into CI, and verify the whole thing end to end

**Files:**
- Modify: `.github/workflows/ci.yml` — the `web` job's checkout step and two new steps after `npm test`

**Interfaces:**
- Consumes: `scripts/changelog/check.mjs` and `scripts/changelog/rules.test.mjs` from Task 5.
- Produces: nothing importable.

- [ ] **Step 1: Give the `web` job's checkout enough history to diff**

In `.github/workflows/ci.yml`, replace the `web` job's `- uses: actions/checkout@v4` with:

```yaml
      - uses: actions/checkout@v4
        with:
          # The changelog guard diffs the pull request against its base. On a
          # pull_request event the checkout is a merge commit whose FIRST parent
          # is the base, so depth 2 is the minimum that makes HEAD^1 resolvable
          # — the default depth-1 clone has no base to diff against, and the
          # guard would exit 2 rather than silently pass.
          fetch-depth: 2
```

Leave the other jobs' checkouts alone; none of them diffs.

- [ ] **Step 2: Add the two guard steps after `Test`**

Append to the `web` job's `steps`, **after** the existing `Founding-credit issuance tests` step. Placement matters: steps run in order and a failing step aborts the job, so a guard placed before `npm test` would mask the web test results whenever it fired.

```yaml
      # Unit tests for the guard's own matching rules. Zero dependencies — pure
      # functions over path strings, so `node --test` needs no node_modules.
      # Its own glob: the founding-credit line above matches only that directory.
      - name: Changelog guard tests
        working-directory: .
        run: node --test scripts/changelog/*.test.mjs

      # A learner-visible pull request must say what changed, or record in
      # SILENT why it needs no announcement. The diff is computed HERE rather
      # than inside the script: no script under scripts/ shells out to git, the
      # repo's only other git assertion is a workflow step (the lab-config pin
      # in build-smoke), and keeping git out of the script is what leaves its
      # rules unit-testable with no repository.
      #
      # pull_request only — a push to main has no base to diff against.
      - name: Changelog guard
        if: github.event_name == 'pull_request'
        working-directory: .
        run: git diff --name-only HEAD^1 HEAD | node scripts/changelog/check.mjs
```

- [ ] **Step 3: Verify the YAML parses and the steps are where you think**

```bash
python3 -c "
import yaml, sys
wf = yaml.safe_load(open('.github/workflows/ci.yml'))
steps = wf['jobs']['web']['steps']
for i, s in enumerate(steps):
    print(i, s.get('name') or s.get('uses'))
co = steps[0]
assert co.get('with', {}).get('fetch-depth') == 2, 'checkout needs fetch-depth: 2'
names = [s.get('name') for s in steps]
assert names.index('Changelog guard') > names.index('Test'), 'guard must run after npm test'
print('OK')
"
```

Expected: the step list printed, ending `... Test / Founding-credit issuance tests / Changelog guard tests / Changelog guard`, then `OK`.

- [ ] **Step 4: Prove the guard would actually fire, against real git**

This is the only step that exercises the CI command itself rather than the script in isolation. It runs the real `git diff` against this branch's base.

```bash
# What the CI step will actually compute, using main as the stand-in for the base.
git diff --name-only main...HEAD | node scripts/changelog/check.mjs; echo "exit=$?"
```

Expected: `exit=0`, reporting learner-visible paths **and** that `web/src/lib/changelog.ts` moved — because this branch did in fact add an entry. Then prove the negative, which is the case that matters:

```bash
git diff --name-only main...HEAD | grep -v '^web/src/lib/changelog\.ts$' | node scripts/changelog/check.mjs; echo "exit=$?"
```

Expected: `exit=1`, listing `web/src/app/...`, `web/src/components/...` and `web/src/i18n/locales/...` as offenders.

- [ ] **Step 5: Run the full web suite and lint**

```bash
cd web && npm test && npm run lint
```

Expected: PASS — every suite, including `dictionary completeness`, `sitemap`, `Footer`, `AuthWall`, and the three new changelog suites.

- [ ] **Step 6: Build the static export and confirm the page really ships**

Green tests are not proof a page exports. Build it and look at the artifact:

```bash
cd web && npm run build
test -f out/changelog.html || { echo "FAIL: /changelog did not export"; exit 1; }
grep -q "Grover" out/changelog.html || { echo "FAIL: entry copy missing from the export"; exit 1; }
grep -q "August 2026" out/changelog.html || { echo "FAIL: month heading missing"; exit 1; }
grep -q "/changelog" out/sitemap.xml || { echo "FAIL: not in the sitemap"; exit 1; }
echo "OK: /changelog exported, populated, and advertised"
```

Expected: `OK: /changelog exported, populated, and advertised`.

Note the export is **English** — `output: "export"` prerenders `DEFAULT_LOCALE` and Spanish only arrives at hydration. Do not add a Spanish assertion here; that path is covered by the component test.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(changelog): fail a learner-visible PR that says nothing about itself"
```

- [ ] **Step 8: Open the pull request**

```bash
git push -u origin feat/changelog
gh pr create --title "feat(changelog): a public, bilingual record of what learners can see" --body "$(cat <<'EOF'
## What

A public `/changelog` page, bilingual, backed by `web/src/lib/changelog.ts` and a CI guard that refuses a learner-visible pull request which leaves that file untouched.

## Why

The site had no way to show a prospective learner that the product is alive, and no mechanism that made announcing a change part of shipping it. Both halves matter: a changelog nobody maintains is worse than none.

## Changes

- **`web/src/lib/changelog.ts`** — the entry model, the `SILENT` ledger, and pure grouping/formatting helpers. The date field is `shipped`, meaning visible in production, because merging is not shipping here.
- **`web/src/lib/changelog-es.ts`** — the Spanish twin, keyed by entry id, with parity asserted in BOTH directions (the repo's other en/es guard checks one).
- **`/changelog`** — public and indexed, registered in `PUBLIC_PATHS` and the sitemap together.
- **`scripts/changelog/`** — pure rules, an executable that reads the diff on stdin, and `node --test` coverage including an assertion that every watched path still exists.
- **CI** — `fetch-depth: 2` on the `web` job's checkout, plus two steps after `npm test`.

There is no bypass flag. A learner-path change that needs no announcement is recorded in `SILENT` with a reason, in the diff, where a reviewer sees it.

## Verification

- `npm test` and `npm run lint` in `web/`, `node --test scripts/changelog/*.test.mjs`
- `npm run build` — asserted `out/changelog.html` exists, carries the entry copy and the month heading, and that `/changelog` is in `out/sitemap.xml`
- Ran the real CI command against this branch both ways: passing with the changelog edit, exiting 1 with it filtered out

**Spec:** `docs/superpowers/specs/2026-08-19-changelog-design.md`
EOF
)"
```

---

## Verification Checklist

Run all of these from the repo root before calling the work done.

```bash
node --test scripts/changelog/*.test.mjs
(cd web && npm test)
(cd web && npm run lint)
(cd web && npm run build && test -f out/changelog.html && grep -q "/changelog" out/sitemap.xml)
git diff --name-only main...HEAD | grep -v '^web/src/lib/changelog\.ts$' | node scripts/changelog/check.mjs   # must exit 1
```

**What remains unexercised, and must be said plainly:** nothing here proves the guard behaves correctly on a real GitHub `pull_request` event — `HEAD^1` resolving to the base is a property of `actions/checkout`'s merge-commit checkout, verified locally only by the `main...HEAD` stand-in. The first pull request that opens against this branch is the real test. If `HEAD^1` turns out not to resolve, the script exits **2** with a wiring-fault message rather than silently passing, which is the failure mode this was designed for.
