# Per-Term Glossary Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every glossary term its own pre-rendered, shareable URL (`/glossary/{slug}`) with per-term SEO/OG metadata, plus copy-link, "more in this category", see-also-as-links, an env-gated sign-up CTA, and a sitemap.

**Architecture:** A pre-rendered dynamic route `glossary/[term]` (one static page per term via `generateStaticParams`, required under `output: "export"`) renders a new `TermDetail` server component. Small shared presentational components (`CategoryChip`, `SeeAlsoLinks`) are extracted from the existing `GlossaryEntry` and reused. See-also links point to `/glossary/{slug}` everywhere. A `sitemap.ts`/`robots.ts` pair (with a single-sourced `SITE_URL`) indexes all routes.

**Tech Stack:** Next.js 16 App Router (static export), React 19, Tailwind v4, Jest + ts-jest + @testing-library/react.

## Global Constraints

- **Run all `npm` commands from `web/`** (e.g. `cd /Users/cperez/dev/altivum-dev/quantum/web && npm test`). Repo root: `/Users/cperez/dev/altivum-dev/quantum`.
- **Static-export safe:** no runtime deps; the only new env var is `NEXT_PUBLIC_SIGNUP_URL` (optional, build-time inlined). Dynamic route MUST set `export const dynamicParams = false;` and provide `generateStaticParams`.
- **Dynamic route shape:** match `web/src/app/learn/[section]/page.tsx` exactly — `params: Promise<{ term: string }>`, `await params`, sync `generateStaticParams()`, async `generateMetadata`, `notFound()` from `next/navigation`.
- **Tests live in `web/__tests__/`** mirroring `src/`. Component/DOM tests: the `/** @jest-environment jsdom */` docblock MUST be the file's FIRST content, followed by `import "@testing-library/jest-dom";`. Data/route-logic tests run in the default `node` env. `react-markdown` is ESM and always mocked — in these tests mock the boundary `@/components/glossary/inline-markdown` (passthrough) and `@/components/transition-link` (plain anchor) so no ESM import occurs.
- **Contrast guard** (`__tests__/contrast-guard.test.ts`): never put solid `bg-accent` and `text-white` on the same source line. Chips use `.hue-soft-bg`/`.hue-text`; the CTA button uses `.surface-accent` (neither token appears literally — safe).
- **Repo components omit explicit return-type annotations** (e.g. `SectionCard`, `Nav`) — follow that; do not add `: JSX.Element`.
- **No emojis** in any UI text. Use inline SVG for arrows, not unicode arrow glyphs.
- `SITE_URL = "https://quantum.altivum.ai"`, single-sourced in `web/src/lib/site.ts`.
- **All work on branch `feat/glossary-term-pages`** (already created; the spec is committed there). Commit after every task.

---

### Task 1: Glossary data helpers — `getTermBySlug`, `termsInSection`, `plainText`

**Files:**
- Modify: `web/src/lib/glossary.ts`
- Test: `web/__tests__/lib/glossary.test.ts` (append)

**Interfaces:**
- Consumes: existing `GLOSSARY`, `termSlug`, `sortedTerms`, `SectionSlug`, `GlossaryTerm`, and the module-local `stripMarkup` (already present from the prior search fix).
- Produces:
  - `getTermBySlug(slug: string): GlossaryTerm | undefined`
  - `termsInSection(section: SectionSlug, excludeTerm?: string): GlossaryTerm[]` (sorted A–Z, excludes `excludeTerm`)
  - `plainText(s: string): string` (strips `$math$` + `` `code` ``, collapses whitespace) — `matchesQuery` is refactored to use it so there is one stripper.

- [ ] **Step 1: Write the failing test** (append to `web/__tests__/lib/glossary.test.ts`)

```ts
import {
  getTermBySlug,
  termsInSection,
  plainText,
} from "@/lib/glossary";

describe("getTermBySlug", () => {
  it("returns the term for a valid slug", () => {
    expect(getTermBySlug("qubit")?.term).toBe("Qubit");
    expect(getTermBySlug("bell-pair")?.term).toBe("Bell pair");
  });
  it("returns undefined for an unknown slug", () => {
    expect(getTermBySlug("not-a-real-term")).toBeUndefined();
  });
  it("round-trips every term's slug", () => {
    for (const t of GLOSSARY) {
      expect(getTermBySlug(termSlug(t.term))).toBe(t);
    }
  });
});

describe("termsInSection", () => {
  it("returns only terms in the section, sorted, excluding the named term", () => {
    const res = termsInSection("01-foundations", "Qubit");
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((t) => t.section === "01-foundations")).toBe(true);
    expect(res.some((t) => t.term === "Qubit")).toBe(false);
    const names = res.map((t) => t.term);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    );
  });
});

describe("plainText", () => {
  it("strips inline math and code and collapses whitespace", () => {
    expect(plainText("A unit vector $\\alpha\\ket{0}$ with `code` here.")).toBe(
      "A unit vector with here."
    );
  });
});
```
(`GLOSSARY` and `termSlug` are already imported at the top of this test file from the existing suite.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- glossary.test`
Expected: FAIL — `getTermBySlug`/`termsInSection`/`plainText` are not exported.

- [ ] **Step 3: Implement in `web/src/lib/glossary.ts`**

Replace the module-local `stripMarkup` with an exported `plainText`, and point `matchesQuery` at it. The current code is:
```ts
function stripMarkup(s: string): string {
  return s.replace(/\$[^$]*\$/g, " ").replace(/`[^`]*`/g, " ");
}
```
Change to:
```ts
export function plainText(s: string): string {
  return s
    .replace(/\$[^$]*\$/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```
In `matchesQuery`, replace `stripMarkup(term.definition)` with `plainText(term.definition)`.

Then add (anywhere after `GLOSSARY` is declared, e.g. at the end of the file):
```ts
export function getTermBySlug(slug: string): GlossaryTerm | undefined {
  return GLOSSARY.find((t) => termSlug(t.term) === slug);
}

export function termsInSection(section: SectionSlug, excludeTerm?: string): GlossaryTerm[] {
  return sortedTerms(GLOSSARY.filter((t) => t.section === section && t.term !== excludeTerm));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- glossary.test`
Expected: PASS (new tests + all existing glossary data/helper/search tests, including the LaTeX-token search regression test which still holds under `plainText`).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/glossary.ts web/__tests__/lib/glossary.test.ts
git commit -m "feat(web): glossary helpers — getTermBySlug, termsInSection, plainText"
```

---

### Task 2: Shared `CategoryChip` + `SeeAlsoLinks`; refactor `GlossaryEntry`

**Files:**
- Create: `web/src/components/glossary/category-chip.tsx`
- Create: `web/src/components/glossary/see-also-links.tsx`
- Modify: `web/src/components/glossary/glossary-entry.tsx`
- Test: `web/__tests__/components/glossary/category-chip.test.tsx`, `web/__tests__/components/glossary/see-also-links.test.tsx`
- Modify test: `web/__tests__/components/glossary/glossary-entry.test.tsx`

**Interfaces:**
- Consumes: `TransitionLink`; `hueFor`, `getSectionBySlug` from `@/lib/sections`; `sectionShortLabel`, `termSlug`, `SectionSlug`, `GlossaryTerm` from `@/lib/glossary`; `InlineMarkdown`.
- Produces:
  - `CategoryChip({ section }: { section: SectionSlug })` — hue chip linking to `/learn/{section}` (self-contained `--hue`).
  - `SeeAlsoLinks({ refs }: { refs?: string[] })` — renders nothing when empty; else "See also:" + links to `/glossary/{termSlug(ref)}`.
  - `GlossaryEntry` now renders the term name as a link to `/glossary/{slug}` and uses the two shared components.

- [ ] **Step 1: Write the failing tests**

`web/__tests__/components/glossary/category-chip.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { CategoryChip } from "@/components/glossary/category-chip";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

describe("CategoryChip", () => {
  it("links to the section lesson with its short label", () => {
    render(<CategoryChip section="02-hardware" />);
    const link = screen.getByRole("link", { name: "Hardware" });
    expect(link).toHaveAttribute("href", "/learn/02-hardware");
  });
});
```

`web/__tests__/components/glossary/see-also-links.test.tsx`:
```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { SeeAlsoLinks } from "@/components/glossary/see-also-links";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

describe("SeeAlsoLinks", () => {
  it("renders nothing when there are no refs", () => {
    const { container } = render(<SeeAlsoLinks refs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("links each ref to its term page", () => {
    render(<SeeAlsoLinks refs={["Bell pair", "Entanglement"]} />);
    expect(screen.getByRole("link", { name: "Bell pair" })).toHaveAttribute("href", "/glossary/bell-pair");
    expect(screen.getByRole("link", { name: "Entanglement" })).toHaveAttribute("href", "/glossary/entanglement");
  });
});
```

Update `web/__tests__/components/glossary/glossary-entry.test.tsx` — replace the see-also test's href expectation and add a term-name-link test. Change the existing assertion `expect(seeAlso).toHaveAttribute("href", "#entanglement");` to:
```tsx
    expect(seeAlso).toHaveAttribute("href", "/glossary/entanglement");
```
and add this test inside the `describe("GlossaryEntry", ...)` block:
```tsx
  it("links the term name to its own page", () => {
    render(<GlossaryEntry term={bell} />);
    expect(screen.getByRole("link", { name: "Bell pair" })).toHaveAttribute("href", "/glossary/bell-pair");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- category-chip see-also-links glossary-entry`
Expected: FAIL — new modules missing; glossary-entry see-also still `#entanglement`.

- [ ] **Step 3: Implement the two components**

`web/src/components/glossary/category-chip.tsx`:
```tsx
import type { CSSProperties } from "react";
import { TransitionLink } from "@/components/transition-link";
import { hueFor, getSectionBySlug } from "@/lib/sections";
import { sectionShortLabel, type SectionSlug } from "@/lib/glossary";

// The hue chip linking a glossary term to the lesson that teaches it. Self-contained:
// it sets its own --hue so it renders correctly in any context (list or term page).
export function CategoryChip({ section }: { section: SectionSlug }) {
  const s = getSectionBySlug(section);
  const hue = s ? hueFor(s.index) : 192;
  return (
    <TransitionLink
      href={`/learn/${section}`}
      style={{ "--hue": hue } as CSSProperties}
      className="hue-soft-bg hue-text rounded-chip px-2 py-0.5 text-xs font-medium interactive focus-ring"
    >
      {sectionShortLabel(section)}
    </TransitionLink>
  );
}
```

`web/src/components/glossary/see-also-links.tsx`:
```tsx
import { TransitionLink } from "@/components/transition-link";
import { termSlug } from "@/lib/glossary";

// Renders a term's "see also" cross-references as links to those terms' own pages.
export function SeeAlsoLinks({ refs }: { refs?: string[] }) {
  if (!refs || refs.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-gray-500">
      See also:{" "}
      {refs.map((ref, i) => (
        <span key={ref}>
          <TransitionLink
            href={`/glossary/${termSlug(ref)}`}
            className="text-accent dark:text-accent-light hover:underline focus-ring rounded"
          >
            {ref}
          </TransitionLink>
          {i < refs.length - 1 ? ", " : ""}
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 4: Refactor `web/src/components/glossary/glossary-entry.tsx`**

Replace the whole file with:
```tsx
"use client";

import { TransitionLink } from "@/components/transition-link";
import { termSlug, type GlossaryTerm } from "@/lib/glossary";
import { InlineMarkdown } from "./inline-markdown";
import { CategoryChip } from "./category-chip";
import { SeeAlsoLinks } from "./see-also-links";

export function GlossaryEntry({ term }: { term: GlossaryTerm }) {
  return (
    <article
      id={termSlug(term.term)}
      className="scroll-mt-24 py-5 border-b border-gray-200/50 dark:border-white/[0.06]"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h3 className="font-display text-display-md tracking-tight">
          <TransitionLink
            href={`/glossary/${termSlug(term.term)}`}
            className="text-gray-900 dark:text-white hover:text-accent dark:hover:text-accent-light focus-ring rounded"
          >
            {term.term}
          </TransitionLink>
        </h3>
        <CategoryChip section={term.section} />
      </div>
      <p className="mt-2 text-gray-600 dark:text-gray-300 leading-relaxed [&_code]:rounded [&_code]:bg-gray-100 dark:[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]">
        <InlineMarkdown>{term.definition}</InlineMarkdown>
      </p>
      <SeeAlsoLinks refs={term.seeAlso} />
    </article>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- category-chip see-also-links glossary-entry "glossary.test"`
Expected: PASS — new component tests, updated glossary-entry tests, and the Glossary list test (which renders `GlossaryEntry`) all green.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/glossary/category-chip.tsx web/src/components/glossary/see-also-links.tsx web/src/components/glossary/glossary-entry.tsx web/__tests__/components/glossary/category-chip.test.tsx web/__tests__/components/glossary/see-also-links.test.tsx web/__tests__/components/glossary/glossary-entry.test.tsx
git commit -m "feat(web): extract CategoryChip + SeeAlsoLinks; term names + see-also link to term pages"
```

---

### Task 3: `CopyLinkButton` (client)

**Files:**
- Create: `web/src/components/glossary/copy-link-button.tsx`
- Test: `web/__tests__/components/glossary/copy-link-button.test.tsx`

**Interfaces:**
- Produces: `CopyLinkButton({ className }: { className?: string })` — copies `window.location.href` to the clipboard on click; shows "Copied" for ~2s; accessible.

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/components/glossary/copy-link-button.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyLinkButton } from "@/components/glossary/copy-link-button";

describe("CopyLinkButton", () => {
  it("copies the current URL and shows feedback", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const user = userEvent.setup();
    render(<CopyLinkButton />);
    await user.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- copy-link-button`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```tsx
// web/src/components/glossary/copy-link-button.tsx
"use client";

import { useCallback, useState } from "react";

export function CopyLinkButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (older browser / insecure context) — no-op.
    }
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Copy link to this term"
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-chip border border-gray-200 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 interactive focus-ring"
      }
    >
      <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656l-1.5 1.5" />
      </svg>
      <span>{copied ? "Copied" : "Copy link"}</span>
      <span className="sr-only" aria-live="polite">{copied ? "Link copied to clipboard" : ""}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- copy-link-button`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/glossary/copy-link-button.tsx web/__tests__/components/glossary/copy-link-button.test.tsx
git commit -m "feat(web): CopyLinkButton for glossary term permalinks"
```

---

### Task 4: `WorkspaceCta` (env-gated, server)

**Files:**
- Create: `web/src/components/glossary/workspace-cta.tsx`
- Test: `web/__tests__/components/glossary/workspace-cta.test.tsx`

**Interfaces:**
- Produces: `WorkspaceCta()` — reads `process.env.NEXT_PUBLIC_SIGNUP_URL`; renders a real "Sign up free" link when set, a "coming soon" teaser when not.

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/components/glossary/workspace-cta.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

describe("WorkspaceCta", () => {
  const original = process.env.NEXT_PUBLIC_SIGNUP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SIGNUP_URL;
    else process.env.NEXT_PUBLIC_SIGNUP_URL = original;
    jest.resetModules();
  });

  it("shows a coming-soon teaser when the signup URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SIGNUP_URL;
    const { WorkspaceCta } = require("@/components/glossary/workspace-cta");
    render(<WorkspaceCta />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up/i })).toBeNull();
  });

  it("renders a signup link when the URL is set", () => {
    process.env.NEXT_PUBLIC_SIGNUP_URL = "https://signup.example.com";
    const { WorkspaceCta } = require("@/components/glossary/workspace-cta");
    render(<WorkspaceCta />);
    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute(
      "href",
      "https://signup.example.com"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- workspace-cta`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```tsx
// web/src/components/glossary/workspace-cta.tsx
// Env-gated sign-up CTA, mirroring AskTutor's NEXT_PUBLIC_TUTOR_URL gate: a live
// link when NEXT_PUBLIC_SIGNUP_URL is configured in Amplify, a "coming soon" teaser
// otherwise. The free Quantum Workspace (Cognito sign-up) does not exist yet.
export function WorkspaceCta() {
  const url = process.env.NEXT_PUBLIC_SIGNUP_URL;
  return (
    <aside className="mt-12 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 shadow-(--shadow-resting)">
      <p className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
        The Quantum Workspace
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Track your progress and go deeper across the whole curriculum. Free account.
      </p>
      <div className="mt-4">
        {url ? (
          <a href={url} className="surface-accent inline-flex items-center rounded-control px-4 py-2 text-sm font-medium">
            Sign up free
          </a>
        ) : (
          <span className="inline-flex items-center rounded-control border border-gray-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-gray-400 dark:text-gray-500">
            Sign-up coming soon
          </span>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- workspace-cta`
Expected: PASS (both env states).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/glossary/workspace-cta.tsx web/__tests__/components/glossary/workspace-cta.test.tsx
git commit -m "feat(web): env-gated Quantum Workspace sign-up CTA"
```

---

### Task 5: `TermDetail` solo-page body

**Files:**
- Create: `web/src/components/glossary/term-detail.tsx`
- Test: `web/__tests__/components/glossary/term-detail.test.tsx`

**Interfaces:**
- Consumes: `GlossaryTerm`, `termsInSection`, `termSlug`, `sectionShortLabel` from `@/lib/glossary`; `TransitionLink`; `InlineMarkdown`; `CategoryChip`; `SeeAlsoLinks`; `CopyLinkButton`; `WorkspaceCta`.
- Produces: `TermDetail({ term }: { term: GlossaryTerm })` — the full solo-page body.

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/components/glossary/term-detail.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TermDetail } from "@/components/glossary/term-detail";
import { getTermBySlug } from "@/lib/glossary";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});
jest.mock("@/components/glossary/inline-markdown", () => {
  const React = require("react");
  return { __esModule: true, InlineMarkdown: ({ children }: { children: string }) => React.createElement("span", null, children) };
});

const qubit = getTermBySlug("qubit")!;

describe("TermDetail", () => {
  it("renders the term as an h1", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByRole("heading", { level: 1, name: "Qubit" })).toBeInTheDocument();
  });
  it("has a back link to the full glossary", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByRole("link", { name: /all terms/i })).toHaveAttribute("href", "/glossary");
  });
  it("shows the category chip linking to the lesson", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByRole("link", { name: "Foundations" })).toHaveAttribute("href", "/learn/01-foundations");
  });
  it("lists related terms in the same category, linking to their pages", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByText(/more in foundations/i)).toBeInTheDocument();
    const bell = screen.getByRole("link", { name: "Bell pair" });
    expect(bell).toHaveAttribute("href", "/glossary/bell-pair");
  });
  it("renders the copy-link button and the coming-soon CTA", () => {
    render(<TermDetail term={qubit} />);
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByText(/the quantum workspace/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- term-detail`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```tsx
// web/src/components/glossary/term-detail.tsx
import { TransitionLink } from "@/components/transition-link";
import { termsInSection, termSlug, sectionShortLabel, type GlossaryTerm } from "@/lib/glossary";
import { InlineMarkdown } from "./inline-markdown";
import { CategoryChip } from "./category-chip";
import { SeeAlsoLinks } from "./see-also-links";
import { CopyLinkButton } from "./copy-link-button";
import { WorkspaceCta } from "./workspace-cta";

export function TermDetail({ term }: { term: GlossaryTerm }) {
  const related = termsInSection(term.section, term.term);

  return (
    <article>
      <TransitionLink
        href="/glossary"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-accent dark:hover:text-accent-light interactive focus-ring rounded"
      >
        <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All terms
      </TransitionLink>

      <h1 className="mt-4 font-display text-display-2xl tracking-tight text-gray-900 dark:text-white">
        {term.term}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <CategoryChip section={term.section} />
        <CopyLinkButton />
      </div>

      <div className="mt-6 text-lg text-gray-700 dark:text-gray-200 leading-relaxed [&_code]:rounded [&_code]:bg-gray-100 dark:[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]">
        <InlineMarkdown>{term.definition}</InlineMarkdown>
      </div>

      <SeeAlsoLinks refs={term.seeAlso} />

      {related.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
            More in {sectionShortLabel(term.section)}
          </h2>
          <ul role="list" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {related.map((t) => (
              <li key={t.term}>
                <TransitionLink
                  href={`/glossary/${termSlug(t.term)}`}
                  className="text-accent dark:text-accent-light hover:underline focus-ring rounded"
                >
                  {t.term}
                </TransitionLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <WorkspaceCta />
    </article>
  );
}
```
(Shows ALL sibling terms, not a capped subset — they are short link labels that wrap, and silent truncation would hide terms; this is the one intentional refinement over the spec's "~8" estimate.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- term-detail`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/glossary/term-detail.tsx web/__tests__/components/glossary/term-detail.test.tsx
git commit -m "feat(web): TermDetail solo-page body (chip, copy-link, see-also, more-in-category, CTA)"
```

---

### Task 6: `site.ts`, `metadataBase`, and the `glossary/[term]` route

**Files:**
- Create: `web/src/lib/site.ts`
- Modify: `web/src/app/layout.tsx` (add `metadataBase`)
- Create: `web/src/app/glossary/[term]/page.tsx`
- Test: `web/__tests__/app/glossary-term-page.test.tsx`

**Interfaces:**
- Consumes: `GLOSSARY`, `getTermBySlug`, `termSlug`, `plainText` from `@/lib/glossary`; `TermDetail`; `SITE_URL`.
- Produces: the route's `generateStaticParams`, `generateMetadata`, and default page; `SITE_URL` constant.

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/app/glossary-term-page.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import GlossaryTermPage, { generateStaticParams, generateMetadata } from "@/app/glossary/[term]/page";
import { GLOSSARY } from "@/lib/glossary";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});
jest.mock("@/components/glossary/inline-markdown", () => {
  const React = require("react");
  return { __esModule: true, InlineMarkdown: ({ children }: { children: string }) => React.createElement("span", null, children) };
});

describe("glossary/[term] route", () => {
  it("emits one static param per glossary term", () => {
    const params = generateStaticParams();
    expect(params).toHaveLength(GLOSSARY.length);
    expect(params).toContainEqual({ term: "qubit" });
  });

  it("builds per-term SEO + OG metadata with math stripped", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ term: "qubit" }) });
    expect(String(md.title)).toMatch(/Qubit/);
    expect(md.alternates?.canonical).toBe("/glossary/qubit");
    expect(md.openGraph?.url).toBe("/glossary/qubit");
    expect(String(md.description)).not.toMatch(/\\ket|\$/);
  });

  it("renders the term detail for a valid slug", async () => {
    const ui = await GlossaryTermPage({ params: Promise.resolve({ term: "qubit" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1, name: "Qubit" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- glossary-term-page`
Expected: FAIL — route module missing.

- [ ] **Step 3: Create `web/src/lib/site.ts`**

```ts
// Single source for the deployed site origin. Imported by the root layout
// (metadataBase), the sitemap, and robots so the base URL is defined once.
export const SITE_URL = "https://quantum.altivum.ai";
```

- [ ] **Step 4: Add `metadataBase` to `web/src/app/layout.tsx`**

Add the import near the top:
```tsx
import { SITE_URL } from "@/lib/site";
```
and add `metadataBase` as the first field of the exported `metadata` object:
```tsx
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Quantum Computing Workspace",
  description: "A progressive learning path through quantum computing with Amazon Braket",
};
```

- [ ] **Step 5: Create the route `web/src/app/glossary/[term]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GLOSSARY, getTermBySlug, termSlug, plainText } from "@/lib/glossary";
import { TermDetail } from "@/components/glossary/term-detail";

interface PageProps {
  params: Promise<{ term: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return GLOSSARY.map((t) => ({ term: termSlug(t.term) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { term: slug } = await params;
  const term = getTermBySlug(slug);
  if (!term) return { title: "Not Found" };
  const description = plainText(term.definition).slice(0, 155);
  const url = `/glossary/${termSlug(term.term)}`;
  return {
    title: `${term.term} — Quantum Glossary`,
    description,
    alternates: { canonical: url },
    openGraph: { title: term.term, description, url, type: "article" },
    twitter: { card: "summary", title: term.term, description },
  };
}

export default async function GlossaryTermPage({ params }: PageProps) {
  const { term: slug } = await params;
  const term = getTermBySlug(slug);
  if (!term) notFound();

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <TermDetail term={term} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- glossary-term-page`
Expected: PASS (params count, metadata shape, page render).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/site.ts web/src/app/layout.tsx web/src/app/glossary/[term]/page.tsx web/__tests__/app/glossary-term-page.test.tsx
git commit -m "feat(web): per-term /glossary/[term] route with SEO/OG metadata + metadataBase"
```

---

### Task 7: `sitemap.ts` + `robots.ts`

**Files:**
- Create: `web/src/app/sitemap.ts`
- Create: `web/src/app/robots.ts`
- Test: `web/__tests__/app/sitemap.test.ts`

**Interfaces:**
- Consumes: `SITE_URL`; `getSections`; `GLOSSARY`, `termSlug`.
- Produces: default `sitemap()` and `robots()` functions.

- [ ] **Step 1: Write the failing test**

```ts
// web/__tests__/app/sitemap.test.ts
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { SITE_URL } from "@/lib/site";
import { getSections } from "@/lib/sections";
import { GLOSSARY, termSlug } from "@/lib/glossary";

describe("sitemap", () => {
  it("includes top routes, every lesson, and every term, all absolute", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}`);
    expect(urls).toContain(`${SITE_URL}/glossary`);
    expect(urls).toContain(`${SITE_URL}/review`);
    for (const s of getSections()) expect(urls).toContain(`${SITE_URL}/learn/${s.slug}`);
    expect(urls).toContain(`${SITE_URL}/glossary/${termSlug(GLOSSARY[0].term)}`);
    expect(urls).toHaveLength(3 + getSections().length + GLOSSARY.length);
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
  });
});

describe("robots", () => {
  it("allows all crawlers and points to the sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sitemap`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// web/src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getSections } from "@/lib/sections";
import { GLOSSARY, termSlug } from "@/lib/glossary";

export const dynamic = "force-static";

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
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sitemap`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/sitemap.ts web/src/app/robots.ts web/__tests__/app/sitemap.test.ts
git commit -m "feat(web): sitemap.xml + robots.txt covering term pages"
```

---

### Task 8: Full suite, lint, and real static-export build verification

**Files:** none (verification; fix only if a real failure surfaces).

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: PASS — entire Jest suite green.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Static-export build**

Run: `npm run build`
Expected: build succeeds; static export emits term pages.

- [ ] **Step 4: Real-path checks on the emitted output**

Run (from `web/`):
```bash
test -f out/glossary/qubit.html && echo TERM_PAGE_OK
grep -c 'rel="canonical"' out/glossary/qubit.html        # per-term canonical present
grep -c 'og:title' out/glossary/qubit.html               # OpenGraph tags present
grep -c '/glossary/' out/glossary/qubit.html             # see-also / related term-page links present
grep -c 'The Quantum Workspace' out/glossary/qubit.html  # CTA rendered
test -f out/glossary/bell-pair.html && echo SECOND_TERM_OK
test -f out/sitemap.xml && grep -c '/glossary/qubit' out/sitemap.xml   # term URL in sitemap
test -f out/robots.txt && grep -c 'sitemap.xml' out/robots.txt          # robots references sitemap
```
Expected: `TERM_PAGE_OK`, `SECOND_TERM_OK`, and every `grep -c` returns non-zero. This is the production render path (unit tests mock react-markdown and don't build pages), confirming per-term pages, metadata, links, the CTA, the sitemap, and robots all materialize.

- [ ] **Step 5: Commit (only if step 4 required a fix; otherwise nothing to commit)**

```bash
git commit -am "fix(web): <describe any build-surfaced fix>"   # skip if the tree is clean
```

---

## Self-Review

**Spec coverage:**
- Per-term route + `generateStaticParams` + `dynamicParams=false` → Task 6. ✓
- Per-term metadata (title/description/canonical/OG/Twitter) + `metadataBase` → Task 6. ✓
- `getTermBySlug`/`termsInSection`/`plainText` → Task 1. ✓
- See-also → term pages everywhere; clickable term names → Task 2. ✓
- `CategoryChip`/`SeeAlsoLinks` extraction → Task 2. ✓
- `TermDetail` (back link, h1, chip, definition, copy-link, see-also, more-in-category, CTA) → Task 5. ✓
- `CopyLinkButton` → Task 3. ✓
- Env-gated `WorkspaceCta` → Task 4. ✓
- `SITE_URL`/`sitemap.ts`/`robots.ts` → Tasks 6, 7. ✓
- Tests + real-path build → every task + Task 8. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code. The only deviation called out explicitly is "show all siblings, not ~8" in Task 5.

**Type consistency:** `getTermBySlug`, `termsInSection`, `plainText`, `termSlug`, `sectionShortLabel`, `CategoryChip({section})`, `SeeAlsoLinks({refs})`, `CopyLinkButton({className})`, `WorkspaceCta()`, `TermDetail({term})`, `SITE_URL` — defined once and consumed with matching signatures across tasks. The route uses `params: Promise<{ term: string }>` + `await`, matching the existing `[section]` route.

## Notes for the executor

- **Reduced motion:** no new bespoke animations are introduced; if you add any, gate behind `prefers-reduced-motion`.
- **`force-static` for sitemap/robots:** required so they export statically; if the installed Next version emits them without it, leaving it in is still correct.
- **CTA env var:** `NEXT_PUBLIC_SIGNUP_URL` is intentionally unset for now (CTA shows "coming soon"); it flips live when set in Amplify. Do not add it to any committed env file.
