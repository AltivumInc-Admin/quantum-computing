# Glossary Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a searchable, alphabetical `/glossary` page of quantum-computing terms, discoverable via a welcome-page card and a new site footer.

**Architecture:** A typed data module (`lib/glossary.ts`) is the single source of truth. A server page shell handles metadata; a client component owns search + A–Z jump-nav and renders letter-grouped entries. Each term is tagged to one of the 7 existing curriculum sections, which single-sources the entry's category chip color (reusing `hueFor`), label, and `/learn/{slug}` link.

**Tech Stack:** Next.js 16 (App Router, static export), React 19, Tailwind v4, `react-markdown` + `remark-math` + `rehype-katex` (already deps), Jest + ts-jest + `@testing-library/react`.

## Global Constraints

- **No emojis** in any user-facing UI text (project rule).
- **Static export safe:** no new runtime deps, no env vars, no server-only APIs. Everything is build-time or client-side (`output: "export"`).
- **Tests live in `web/__tests__/`** mirroring `src/`. Component/DOM tests need a `/** @jest-environment jsdom */` docblock and `import "@testing-library/jest-dom";` (there is no global jest setup file). Lib/data tests run in the default `node` env.
- **`react-markdown` is ESM-only and the repo's jest runs CommonJS** — it is always `jest.mock`ed in tests. Never assert real KaTeX output in a unit test; real math rendering is verified by the static-export build. In component tests, mock the nearest boundary (the `InlineMarkdown` module) rather than `react-markdown` directly.
- **Contrast guard** (`__tests__/contrast-guard.test.ts`) fails the build if any source line pairs solid `bg-accent` (not `bg-accent-dark/-light` or `bg-accent/<n>`) with `text-white`. Never put both tokens on one line. Category chips use `.hue-soft-bg` + `.hue-text` (proven-legible hue utilities), not `bg-accent`.
- **Reuse, do not duplicate:** slugs via `slugify` from `@/lib/slug`; section hue via `hueFor` + `getSectionBySlug` from `@/lib/sections`; KaTeX macros via the shared module created in Task 2.
- **All work on branch `feat/glossary-page`** (already created; the design spec is committed there). Commit after every task.
- **GitHub repo URL** (for the footer link): `https://github.com/AltivumInc-Admin/quantum-computing`.
- **Run from `web/`:** all `npm` commands below assume CWD `web/`.

---

### Task 1: Glossary data module — types, helpers, seed entries

**Files:**
- Create: `web/src/lib/glossary.ts`
- Test: `web/__tests__/lib/glossary.test.ts`

**Interfaces:**
- Consumes: `getSections`, `getSectionBySlug` from `@/lib/sections` (test only); `slugify` from `@/lib/slug`.
- Produces:
  - `type SectionSlug` (the 7 curriculum slugs)
  - `interface GlossaryTerm { term: string; definition: string; section: SectionSlug; aliases?: string[]; seeAlso?: string[]; }`
  - `const GLOSSARY: GlossaryTerm[]` (seeded here; expanded in Task 8)
  - `const SECTION_SHORT_LABEL: Record<SectionSlug, string>`
  - `function sectionShortLabel(slug: SectionSlug): string`
  - `function firstLetter(term: string): string`
  - `function sortedTerms(terms?: GlossaryTerm[]): GlossaryTerm[]`
  - `interface LetterGroup { letter: string; terms: GlossaryTerm[]; }`
  - `function groupByLetter(terms: GlossaryTerm[]): LetterGroup[]`
  - `function matchesQuery(term: GlossaryTerm, query: string): boolean`
  - `const ALPHABET: string[]`
  - `function termSlug(term: string): string` (wraps `slugify`, used for anchor ids)

- [ ] **Step 1: Write the failing test**

```ts
// web/__tests__/lib/glossary.test.ts
import {
  GLOSSARY,
  SECTION_SHORT_LABEL,
  sectionShortLabel,
  sortedTerms,
  groupByLetter,
  matchesQuery,
  termSlug,
  ALPHABET,
  type GlossaryTerm,
} from "@/lib/glossary";
import { getSections, getSectionBySlug } from "@/lib/sections";

describe("glossary data integrity", () => {
  it("has unique term names (case-insensitive)", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const t of GLOSSARY) {
      const key = t.term.toLowerCase();
      if (seen.has(key)) dupes.push(t.term);
      seen.set(key, t.term);
    }
    expect(dupes).toEqual([]);
  });

  it("tags every term with a real curriculum section slug", () => {
    const valid = new Set(getSections().map((s) => s.slug));
    const bad = GLOSSARY.filter((t) => !valid.has(t.section)).map((t) => t.term);
    expect(bad).toEqual([]);
  });

  it("resolves every seeAlso reference to an existing term", () => {
    const terms = new Set(GLOSSARY.map((t) => t.term));
    const broken: string[] = [];
    for (const t of GLOSSARY) {
      for (const ref of t.seeAlso ?? []) {
        if (!terms.has(ref)) broken.push(`${t.term} -> ${ref}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("produces a unique anchor slug per term (no collisions)", () => {
    const slugs = GLOSSARY.map((t) => termSlug(t.term));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("maps a short label for exactly the 7 curriculum slugs", () => {
    const labelSlugs = Object.keys(SECTION_SHORT_LABEL).sort();
    const manifestSlugs = getSections().map((s) => s.slug).sort();
    expect(labelSlugs).toEqual(manifestSlugs);
    for (const s of getSections()) {
      expect(sectionShortLabel(s.slug as never)).toBe(SECTION_SHORT_LABEL[s.slug as never]);
      expect(getSectionBySlug(s.slug)).toBeDefined(); // label slug is a real section
    }
  });
});

describe("glossary helpers", () => {
  const sample: GlossaryTerm[] = [
    { term: "Qubit", definition: "x", section: "01-foundations" },
    { term: "amplitude", definition: "y", section: "00-prereqs" },
    { term: "Ansatz", definition: "z", section: "04-quantum-ml" },
  ];

  it("sorts terms A-Z, case-insensitively", () => {
    expect(sortedTerms(sample).map((t) => t.term)).toEqual(["amplitude", "Ansatz", "Qubit"]);
  });

  it("groups sorted terms under their uppercase first letter", () => {
    const groups = groupByLetter(sample);
    expect(groups.map((g) => g.letter)).toEqual(["A", "Q"]);
    expect(groups[0].terms.map((t) => t.term)).toEqual(["amplitude", "Ansatz"]);
  });

  it("matches a query against term, alias, and definition (case/diacritic-insensitive)", () => {
    const t: GlossaryTerm = {
      term: "CNOT gate", definition: "entangling gate", section: "01-foundations", aliases: ["CX"],
    };
    expect(matchesQuery(t, "")).toBe(true);          // empty matches all
    expect(matchesQuery(t, "cnot")).toBe(true);       // term, case-insensitive
    expect(matchesQuery(t, "cx")).toBe(true);         // alias
    expect(matchesQuery(t, "entangl")).toBe(true);    // definition substring
    expect(matchesQuery(t, "grover")).toBe(false);    // no match
  });

  it("exposes the 26-letter alphabet", () => {
    expect(ALPHABET).toHaveLength(26);
    expect(ALPHABET[0]).toBe("A");
    expect(ALPHABET[25]).toBe("Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- glossary.test`
Expected: FAIL — `Cannot find module '@/lib/glossary'`.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/lib/glossary.ts
import { slugify } from "@/lib/slug";

export type SectionSlug =
  | "00-prereqs"
  | "01-foundations"
  | "02-hardware"
  | "03-algorithms"
  | "04-quantum-ml"
  | "05-quantum-chemistry"
  | "06-hybrid-jobs";

export interface GlossaryTerm {
  term: string;
  definition: string; // inline markdown: `code` and $math$ permitted
  section: SectionSlug;
  aliases?: string[];
  seeAlso?: string[]; // exact `term` values of related entries
}

// Short, chip-sized labels for each curriculum section. Abbreviates the long
// manifest titles ("Prerequisites: From Zero to..." -> "Prerequisites"). The
// glossary.test asserts these keys are exactly the 7 manifest slugs.
export const SECTION_SHORT_LABEL: Record<SectionSlug, string> = {
  "00-prereqs": "Prerequisites",
  "01-foundations": "Foundations",
  "02-hardware": "Hardware",
  "03-algorithms": "Algorithms",
  "04-quantum-ml": "Quantum ML",
  "05-quantum-chemistry": "Chemistry",
  "06-hybrid-jobs": "Hybrid Jobs",
};

export function sectionShortLabel(slug: SectionSlug): string {
  return SECTION_SHORT_LABEL[slug];
}

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function termSlug(term: string): string {
  return slugify(term);
}

export function firstLetter(term: string): string {
  return term.trim().charAt(0).toUpperCase();
}

export function sortedTerms(terms: GlossaryTerm[] = GLOSSARY): GlossaryTerm[] {
  return [...terms].sort((a, b) =>
    a.term.localeCompare(b.term, "en", { sensitivity: "base" })
  );
}

export interface LetterGroup {
  letter: string;
  terms: GlossaryTerm[];
}

export function groupByLetter(terms: GlossaryTerm[]): LetterGroup[] {
  const groups: LetterGroup[] = [];
  for (const t of sortedTerms(terms)) {
    const letter = firstLetter(t.term);
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.terms.push(t);
    else groups.push({ letter, terms: [t] });
  }
  return groups;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function matchesQuery(term: GlossaryTerm, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const haystack = [term.term, ...(term.aliases ?? []), term.definition].map(normalize);
  return haystack.some((h) => h.includes(q));
}

// Seed set (expanded to the full inventory in Task 8). Real, reviewed entries
// spanning several letters/sections so the page and its tests exercise grouping,
// multiple hues, aliases, seeAlso, and inline math from the start.
export const GLOSSARY: GlossaryTerm[] = [
  { term: "Amplitude", section: "00-prereqs", aliases: ["probability amplitude"],
    definition: "A complex number attached to a basis state in a superposition; its squared magnitude gives the probability of measuring that state.",
    seeAlso: ["Born rule"] },
  { term: "Ansatz", section: "04-quantum-ml", aliases: ["trial state"],
    definition: "A parameterized quantum circuit whose rotation angles a classical optimizer tunes; the trial form a variational algorithm searches over.",
    seeAlso: ["Variational quantum eigensolver"] },
  { term: "Bell pair", section: "01-foundations", aliases: ["Bell state"],
    definition: "Two qubits in a maximally entangled state such as $\\ket{\\Phi^+} = (\\ket{00}+\\ket{11})/\\sqrt2$; measuring one fixes the other's outcome.",
    seeAlso: ["Entanglement"] },
  { term: "Bloch sphere", section: "01-foundations",
    definition: "A geometric picture of one qubit as a point on a unit sphere: $\\ket{0}$ at the north pole, $\\ket{1}$ at the south, superpositions around the equator.",
    seeAlso: ["Qubit"] },
  { term: "Born rule", section: "01-foundations",
    definition: "The rule that a measurement outcome's probability equals the squared magnitude of its amplitude, $|\\alpha|^2$.",
    seeAlso: ["Measurement", "Amplitude"] },
  { term: "CNOT gate", section: "01-foundations", aliases: ["CX", "controlled-NOT"],
    definition: "A two-qubit gate that flips the target qubit when the control is $\\ket{1}$; the standard entangling gate.",
    seeAlso: ["Entanglement"] },
  { term: "Entanglement", section: "01-foundations",
    definition: "A correlation between qubits with no classical analogue: the joint state cannot be factored into independent single-qubit states.",
    seeAlso: ["Bell pair"] },
  { term: "Hadamard gate", section: "01-foundations", aliases: ["H gate"],
    definition: "A single-qubit gate that maps $\\ket{0}$ to the equal superposition $(\\ket{0}+\\ket{1})/\\sqrt2$.",
    seeAlso: ["Superposition"] },
  { term: "Hamiltonian", section: "05-quantum-chemistry",
    definition: "The operator representing a system's total energy; its lowest eigenvalue is the ground-state energy that algorithms like VQE estimate.",
    seeAlso: ["Variational quantum eigensolver"] },
  { term: "Measurement", section: "01-foundations",
    definition: "Reading a qubit, which collapses its superposition to a basis state with a probability set by the Born rule.",
    seeAlso: ["Born rule"] },
  { term: "Qubit", section: "01-foundations",
    definition: "The basic unit of quantum information: a two-level system whose state is a unit vector $\\alpha\\ket{0}+\\beta\\ket{1}$ in $\\mathbb{C}^2$.",
    seeAlso: ["Superposition", "Bloch sphere"] },
  { term: "Superposition", section: "01-foundations",
    definition: "A qubit state that is a linear combination of basis states, holding $\\ket{0}$ and $\\ket{1}$ at once until measured.",
    seeAlso: ["Qubit", "Measurement"] },
  { term: "Unitary matrix", section: "00-prereqs", aliases: ["unitary operator"],
    definition: "A matrix $U$ with $U^\\dagger U = I$; every quantum gate is unitary because such matrices preserve a state's norm.",
    seeAlso: ["Qubit"] },
  { term: "Variational quantum eigensolver", section: "05-quantum-chemistry", aliases: ["VQE"],
    definition: "A hybrid algorithm that measures a Hamiltonian's energy on a quantum device while a classical optimizer minimizes it to estimate the ground state.",
    seeAlso: ["Hamiltonian", "Ansatz"] },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- glossary.test`
Expected: PASS (all integrity + helper tests green).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/glossary.ts web/__tests__/lib/glossary.test.ts
git commit -m "feat(web): glossary data module — types, helpers, seed entries"
```

---

### Task 2: Shared KaTeX macros + InlineMarkdown definition renderer

**Files:**
- Create: `web/src/lib/katex-macros.ts`
- Modify: `web/src/components/markdown-renderer.tsx` (import the extracted macros instead of the local const)
- Create: `web/src/components/glossary/inline-markdown.tsx`
- Test: `web/__tests__/components/glossary/inline-markdown.test.tsx`

**Interfaces:**
- Produces: `const KATEX_MACROS` (from `@/lib/katex-macros`); `function InlineMarkdown({ children }: { children: string }): JSX.Element` rendering a definition string as inline content (inline `code` + `$math$`), with the wrapping `<p>` unwrapped so it flows inline.

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/components/glossary/inline-markdown.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { InlineMarkdown } from "@/components/glossary/inline-markdown";

// react-markdown + plugins are ESM-only; the repo runs jest in CommonJS, so they
// are mocked. This minimal mock unwraps the single paragraph and turns `code`
// spans into <code>, which is all InlineMarkdown's contract needs to assert.
// Real KaTeX rendering is covered by the static-export build, not here.
jest.mock("react-markdown", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children, components }: { children: string; components?: Record<string, React.FC<{ children?: React.ReactNode }>> }) => {
      const parts = String(children).split(/(`[^`]+`)/g).filter(Boolean).map((seg, i) =>
        seg.startsWith("`") && seg.endsWith("`")
          ? React.createElement("code", { key: i }, seg.slice(1, -1))
          : seg
      );
      const P = components?.p ?? ((props: { children?: React.ReactNode }) => React.createElement("p", null, props.children));
      return React.createElement(P, null, parts);
    },
  };
});
jest.mock("remark-math", () => () => {});
jest.mock("rehype-katex", () => () => {});

describe("InlineMarkdown", () => {
  it("renders plain definition text", () => {
    render(<InlineMarkdown>A unit of quantum information.</InlineMarkdown>);
    expect(screen.getByText("A unit of quantum information.")).toBeInTheDocument();
  });

  it("renders inline code spans as <code>", () => {
    const { container } = render(<InlineMarkdown>{"satisfies `U† U = I`"}</InlineMarkdown>);
    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent("U† U = I");
  });

  it("does not wrap output in a block <p> (renders inline)", () => {
    const { container } = render(<InlineMarkdown>inline only</InlineMarkdown>);
    expect(container.querySelector("p")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- inline-markdown.test`
Expected: FAIL — `Cannot find module '@/components/glossary/inline-markdown'`.

- [ ] **Step 3: Write the implementation**

First, extract the macros into a shared module:

```ts
// web/src/lib/katex-macros.ts
// Shared bra-ket macros so authors write \ket{0} instead of \left|0\right\rangle.
// KaTeX renders these to HTML+CSS at build time (static-export safe). Used by the
// lesson MarkdownRenderer and the glossary InlineMarkdown so notation stays uniform.
export const KATEX_MACROS = {
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle#1\\right|",
  "\\braket": "\\left\\langle#1\\middle|#2\\right\\rangle",
  "\\expval": "\\left\\langle#1\\right\\rangle",
};
```

Then update `web/src/components/markdown-renderer.tsx`: remove the local `KATEX_MACROS` const (lines 24-29) and import it instead. Add near the other imports:

```ts
import { KATEX_MACROS } from "@/lib/katex-macros";
```

and delete the inline `const KATEX_MACROS = {...};` block. (The existing `rehypeKatex` usage `[rehypeKatex, { macros: KATEX_MACROS, throwOnError: false }]` is unchanged and now references the imported constant.)

Then create the inline renderer:

```tsx
// web/src/components/glossary/inline-markdown.tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { KATEX_MACROS } from "@/lib/katex-macros";

/**
 * Renders a glossary definition string as INLINE content: inline `code` and
 * $math$ (KaTeX) only. The single wrapping <p> react-markdown emits is unwrapped
 * to a fragment so the definition flows inside the entry's own <p>. Definitions
 * are authored as a single inline string (no block elements), so unwrapping <p>
 * is sufficient.
 */
export function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[[rehypeKatex, { macros: KATEX_MACROS, throwOnError: false }]]}
      components={{ p: ({ children }) => <>{children}</> }}
    >
      {children}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- inline-markdown.test`
Expected: PASS.

- [ ] **Step 5: Verify the macro extraction did not break the markdown renderer**

Run: `npm test -- markdown-renderer`
Expected: PASS (all existing markdown-renderer tests still green).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/katex-macros.ts web/src/components/markdown-renderer.tsx web/src/components/glossary/inline-markdown.tsx web/__tests__/components/glossary/inline-markdown.test.tsx
git commit -m "feat(web): InlineMarkdown for glossary defs; extract shared KaTeX macros"
```

---

### Task 3: GlossaryEntry component (term, category chip, definition, see-also)

**Files:**
- Create: `web/src/components/glossary/glossary-entry.tsx`
- Test: `web/__tests__/components/glossary/glossary-entry.test.tsx`

**Interfaces:**
- Consumes: `GlossaryTerm`, `sectionShortLabel`, `termSlug` from `@/lib/glossary`; `hueFor`, `getSectionBySlug` from `@/lib/sections`; `InlineMarkdown` from `./inline-markdown`; `TransitionLink` from `@/components/transition-link`.
- Produces: `function GlossaryEntry({ term }: { term: GlossaryTerm }): JSX.Element` — an `<article>` with `id={termSlug(term.term)}`, a heading, a hue-colored chip linking to `/learn/{section}`, the rendered definition, and any see-also anchor links.

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/components/glossary/glossary-entry.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { GlossaryEntry } from "@/components/glossary/glossary-entry";
import type { GlossaryTerm } from "@/lib/glossary";

// TransitionLink -> plain anchor (no app router needed). InlineMarkdown -> plain
// passthrough so this test never imports the ESM react-markdown.
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
  return {
    __esModule: true,
    InlineMarkdown: ({ children }: { children: string }) => React.createElement("span", null, children),
  };
});

const bell: GlossaryTerm = {
  term: "Bell pair",
  definition: "Two maximally entangled qubits.",
  section: "01-foundations",
  seeAlso: ["Entanglement"],
};

describe("GlossaryEntry", () => {
  it("renders the term name", () => {
    render(<GlossaryEntry term={bell} />);
    expect(screen.getByRole("heading", { name: "Bell pair" })).toBeInTheDocument();
  });

  it("renders the definition text", () => {
    render(<GlossaryEntry term={bell} />);
    expect(screen.getByText("Two maximally entangled qubits.")).toBeInTheDocument();
  });

  it("shows a category chip linking to the section's lesson", () => {
    render(<GlossaryEntry term={bell} />);
    const chip = screen.getByRole("link", { name: /Foundations/ });
    expect(chip).toHaveAttribute("href", "/learn/01-foundations");
  });

  it("anchors the entry with a slug id for see-also targeting", () => {
    const { container } = render(<GlossaryEntry term={bell} />);
    expect(container.querySelector("#bell-pair")).not.toBeNull();
  });

  it("renders see-also links to related term anchors", () => {
    render(<GlossaryEntry term={bell} />);
    const seeAlso = screen.getByRole("link", { name: "Entanglement" });
    expect(seeAlso).toHaveAttribute("href", "#entanglement");
  });

  it("omits the see-also row when there are no references", () => {
    render(<GlossaryEntry term={{ term: "Qubit", definition: "x", section: "01-foundations" }} />);
    expect(screen.queryByText(/See also/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- glossary-entry.test`
Expected: FAIL — `Cannot find module '@/components/glossary/glossary-entry'`.

- [ ] **Step 3: Write the implementation**

```tsx
// web/src/components/glossary/glossary-entry.tsx
"use client";

import type { CSSProperties } from "react";
import { TransitionLink } from "@/components/transition-link";
import { hueFor, getSectionBySlug } from "@/lib/sections";
import { sectionShortLabel, termSlug, type GlossaryTerm } from "@/lib/glossary";
import { InlineMarkdown } from "./inline-markdown";

export function GlossaryEntry({ term }: { term: GlossaryTerm }) {
  const section = getSectionBySlug(term.section);
  const hue = section ? hueFor(section.index) : 192;

  return (
    <article
      id={termSlug(term.term)}
      style={{ "--hue": hue } as CSSProperties}
      className="scroll-mt-24 py-5 border-b border-gray-200/50 dark:border-white/[0.06]"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h3 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
          {term.term}
        </h3>
        <TransitionLink
          href={`/learn/${term.section}`}
          className="hue-soft-bg hue-text rounded-chip px-2 py-0.5 text-xs font-medium interactive focus-ring"
        >
          {sectionShortLabel(term.section)}
        </TransitionLink>
      </div>
      <p className="mt-2 text-gray-600 dark:text-gray-300 leading-relaxed [&_code]:rounded [&_code]:bg-gray-100 dark:[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]">
        <InlineMarkdown>{term.definition}</InlineMarkdown>
      </p>
      {term.seeAlso && term.seeAlso.length > 0 ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
          See also:{" "}
          {term.seeAlso.map((ref, i) => (
            <span key={ref}>
              <a href={`#${termSlug(ref)}`} className="hue-text hover:underline focus-ring rounded">
                {ref}
              </a>
              {i < term.seeAlso!.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- glossary-entry.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/glossary/glossary-entry.tsx web/__tests__/components/glossary/glossary-entry.test.tsx
git commit -m "feat(web): GlossaryEntry — term, hue category chip, definition, see-also"
```

---

### Task 4: Glossary client component (search + A–Z jump-nav + grouped entries)

**Files:**
- Create: `web/src/components/glossary/glossary.tsx`
- Test: `web/__tests__/components/glossary/glossary.test.tsx`

**Interfaces:**
- Consumes: `GLOSSARY`, `groupByLetter`, `matchesQuery`, `ALPHABET` from `@/lib/glossary`; `GlossaryEntry` from `./glossary-entry`.
- Produces: `function Glossary(): JSX.Element` — search input (role `searchbox`), an `aria-label="Jump to letter"` nav (present letters are links to `#letter-X`, absent letters are inert `aria-hidden` spans), an `aria-live` result count, and letter-grouped `GlossaryEntry`s with an empty state.

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/components/glossary/glossary.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Glossary } from "@/components/glossary/glossary";
import { GLOSSARY } from "@/lib/glossary";

// Render real GlossaryEntry but stub its leaf dependencies so no ESM/app-router.
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
  return {
    __esModule: true,
    InlineMarkdown: ({ children }: { children: string }) => React.createElement("span", null, children),
  };
});

describe("Glossary", () => {
  it("renders every seed term on first paint", () => {
    render(<Glossary />);
    for (const t of GLOSSARY) {
      expect(screen.getByRole("heading", { name: t.term })).toBeInTheDocument();
    }
  });

  it("narrows the visible terms as the user types", async () => {
    const user = userEvent.setup();
    render(<Glossary />);
    await user.type(screen.getByRole("searchbox"), "qubit");
    expect(screen.getByRole("heading", { name: "Qubit" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hadamard gate" })).toBeNull();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Glossary />);
    await user.type(screen.getByRole("searchbox"), "zzzznope");
    expect(screen.getByText(/no terms match/i)).toBeInTheDocument();
  });

  it("offers a jump link only for letters that have matches", async () => {
    const user = userEvent.setup();
    render(<Glossary />);
    await user.type(screen.getByRole("searchbox"), "qubit"); // only "Q" remains
    expect(screen.getByRole("link", { name: /jump to Q/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /jump to A/i })).toBeNull();
  });

  it("announces the result count for assistive tech", () => {
    render(<Glossary />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(`${GLOSSARY.length} terms`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "glossary.test"`
Expected: FAIL — `Cannot find module '@/components/glossary/glossary'`.

- [ ] **Step 3: Write the implementation**

```tsx
// web/src/components/glossary/glossary.tsx
"use client";

import { useId, useMemo, useState } from "react";
import { GLOSSARY, groupByLetter, matchesQuery, ALPHABET } from "@/lib/glossary";
import { GlossaryEntry } from "./glossary-entry";

export function Glossary() {
  const [query, setQuery] = useState("");
  const searchId = useId();

  const filtered = useMemo(() => GLOSSARY.filter((t) => matchesQuery(t, query)), [query]);
  const groups = useMemo(() => groupByLetter(filtered), [filtered]);
  const present = useMemo(() => new Set(groups.map((g) => g.letter)), [groups]);

  return (
    <div>
      <div className="sticky top-16 z-10 -mx-4 px-4 py-4 bg-(--surface-base)/80 backdrop-blur-md">
        <label htmlFor={searchId} className="sr-only">
          Search glossary terms
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms..."
          autoComplete="off"
          className="w-full rounded-control border border-gray-200 dark:border-white/10 bg-(--surface-1) px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus-ring shadow-(--shadow-resting)"
        />
        <nav aria-label="Jump to letter" className="mt-3 flex flex-wrap gap-1">
          {ALPHABET.map((letter) =>
            present.has(letter) ? (
              <a
                key={letter}
                href={`#letter-${letter}`}
                aria-label={`Jump to ${letter}`}
                className="w-7 h-7 flex items-center justify-center rounded-chip text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 interactive focus-ring"
              >
                {letter}
              </a>
            ) : (
              <span
                key={letter}
                aria-hidden="true"
                className="w-7 h-7 flex items-center justify-center rounded-chip text-xs font-medium text-gray-300 dark:text-gray-700 select-none"
              >
                {letter}
              </span>
            )
          )}
        </nav>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {filtered.length} terms
      </p>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-gray-500 dark:text-gray-400">
          No terms match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.letter} aria-labelledby={`letter-${group.letter}`} className="mt-8">
            <h2
              id={`letter-${group.letter}`}
              className="scroll-mt-36 font-display text-display-lg text-accent dark:text-accent-light"
            >
              {group.letter}
            </h2>
            <ul role="list" className="mt-2">
              {group.terms.map((term) => (
                <li key={term.term}>
                  <GlossaryEntry term={term} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "glossary.test"`
Expected: PASS. (If `@testing-library/user-event` is missing, install it: `npm i -D @testing-library/user-event` — but verify first with `npm ls @testing-library/user-event`; several existing interactive widget tests use it, so it is expected to already be present.)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/glossary/glossary.tsx web/__tests__/components/glossary/glossary.test.tsx
git commit -m "feat(web): Glossary client — live search, A-Z jump-nav, grouped entries"
```

---

### Task 5: `/glossary` route page

**Files:**
- Create: `web/src/app/glossary/page.tsx`
- Test: `web/__tests__/app/glossary-page.test.tsx`

**Interfaces:**
- Consumes: `Glossary` from `@/components/glossary/glossary`.
- Produces: a default-exported `GlossaryPage` server component and an exported `metadata`.

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/app/glossary-page.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import GlossaryPage, { metadata } from "@/app/glossary/page";

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
  return {
    __esModule: true,
    InlineMarkdown: ({ children }: { children: string }) => React.createElement("span", null, children),
  };
});

describe("GlossaryPage", () => {
  it("exports SEO metadata mentioning the glossary", () => {
    expect(String(metadata.title)).toMatch(/glossary/i);
    expect(String(metadata.description)).toMatch(/term/i);
  });

  it("renders a page heading and the searchable glossary", () => {
    render(<GlossaryPage />);
    expect(screen.getByRole("heading", { level: 1, name: /glossary/i })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- glossary-page.test`
Expected: FAIL — `Cannot find module '@/app/glossary/page'`.

- [ ] **Step 3: Write the implementation**

```tsx
// web/src/app/glossary/page.tsx
import type { Metadata } from "next";
import { Glossary } from "@/components/glossary/glossary";

export const metadata: Metadata = {
  title: "Glossary — Quantum Computing Workspace",
  description:
    "An A-Z reference of quantum computing terms, from qubits and gates to VQE and QAOA, each linked to the lesson that teaches it.",
};

export default function GlossaryPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-widest uppercase text-accent dark:text-accent-light mb-4">
            Reference
          </p>
          <h1 className="font-display text-display-2xl tracking-tight text-gray-900 dark:text-white">
            Glossary
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
            Look up any quantum computing term, A to Z. Each entry links to the lesson where it is taught.
          </p>
        </header>
        <Glossary />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- glossary-page.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/glossary/page.tsx web/__tests__/app/glossary-page.test.tsx
git commit -m "feat(web): /glossary route — server shell + SEO metadata"
```

---

### Task 6: Site footer

**Files:**
- Create: `web/src/components/footer.tsx`
- Modify: `web/src/app/layout.tsx` (mount `<Footer />` after `</main>`)
- Test: `web/__tests__/components/footer.test.tsx`

**Interfaces:**
- Produces: `function Footer(): JSX.Element` — a `<footer>` with a tagline and links to Glossary (`/glossary`), Review (`/review`), and GitHub (external, new tab).

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/components/footer.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/footer";

jest.mock("next/link", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

describe("Footer", () => {
  it("links to the glossary", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Glossary" })).toHaveAttribute("href", "/glossary");
  });

  it("links to the review dashboard", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/review");
  });

  it("links to the GitHub repo in a new tab, safely", () => {
    render(<Footer />);
    const gh = screen.getByRole("link", { name: "GitHub" });
    expect(gh).toHaveAttribute("href", "https://github.com/AltivumInc-Admin/quantum-computing");
    expect(gh).toHaveAttribute("target", "_blank");
    expect(gh).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- footer.test`
Expected: FAIL — `Cannot find module '@/components/footer'`.

- [ ] **Step 3: Write the implementation**

```tsx
// web/src/components/footer.tsx
import Link from "next/link";

const REPO_URL = "https://github.com/AltivumInc-Admin/quantum-computing";

const linkClass =
  "text-gray-600 dark:text-gray-400 hover:text-accent dark:hover:text-accent-light interactive focus-ring rounded transition-colors";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-gray-200/60 dark:border-gray-800/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-500">
          Quantum Workspace — learn quantum computing with Amazon Braket.
        </p>
        <nav aria-label="Footer" className="flex items-center gap-6 text-sm font-medium">
          <Link href="/glossary" className={linkClass}>
            Glossary
          </Link>
          <Link href="/review" className={linkClass}>
            Review
          </Link>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
            GitHub
          </a>
        </nav>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 text-xs text-gray-400 dark:text-gray-600">
        Altivum Inc. — built with Amazon Braket.
      </div>
    </footer>
  );
}
```

Then mount it in `web/src/app/layout.tsx`. Add the import alongside the others:

```tsx
import { Footer } from "@/components/footer";
```

and place `<Footer />` immediately after the closing `</main>` (before `<AskTutor />`):

```tsx
          <main id="main" tabIndex={-1} className="outline-none">
            {children}
          </main>
          <Footer />
          <AskTutor />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- footer.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/footer.tsx web/src/app/layout.tsx web/__tests__/components/footer.test.tsx
git commit -m "feat(web): site footer with Glossary / Review / GitHub links"
```

---

### Task 7: Welcome-page glossary card

**Files:**
- Create: `web/src/components/glossary-card.tsx`
- Modify: `web/src/app/page.tsx` (append the card after the section grid)
- Test: `web/__tests__/components/glossary-card.test.tsx`

**Interfaces:**
- Consumes: `TransitionLink` from `@/components/transition-link`.
- Produces: `function GlossaryCard(): JSX.Element` — a card (SectionCard visual language, no number) labeled "Reference"/"Glossary" linking to `/glossary`.

- [ ] **Step 1: Write the failing test**

```tsx
// web/__tests__/components/glossary-card.test.tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { GlossaryCard } from "@/components/glossary-card";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

describe("GlossaryCard", () => {
  it("links to the glossary page", () => {
    render(<GlossaryCard />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/glossary");
  });

  it("presents itself as a reference titled Glossary", () => {
    render(<GlossaryCard />);
    expect(screen.getByText("Glossary")).toBeInTheDocument();
    expect(screen.getByText(/reference/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- glossary-card.test`
Expected: FAIL — `Cannot find module '@/components/glossary-card'`.

- [ ] **Step 3: Write the implementation**

```tsx
// web/src/components/glossary-card.tsx
import type { CSSProperties } from "react";
import { TransitionLink } from "@/components/transition-link";

// Companion resource card. Mirrors SectionCard's chrome (rounded card, surface
// token, hover lift/glow) but carries a "Reference" eyebrow and no number badge,
// so it reads as a sibling resource rather than a numbered curriculum module.
export function GlossaryCard() {
  return (
    <TransitionLink
      href="/glossary"
      aria-label="Glossary, an A to Z reference of quantum terms"
      style={{ "--hue": 192 } as CSSProperties}
      className="group relative block rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) backdrop-blur-md overflow-hidden interactive focus-ring shadow-(--shadow-resting) hover:-translate-y-1.5 hover:shadow-(--shadow-raised) hover:border-gray-300/80 dark:hover:border-white/[0.12] transition-all duration-300"
    >
      <div className="section-glow absolute inset-[-1px] rounded-card opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="section-bleed relative h-20 rounded-card">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-(--surface-1)" />
      </div>
      <div className="relative p-6 -mt-6">
        <p className="text-xs font-semibold tracking-widest uppercase hue-text mb-3">Reference</p>
        <h3 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200">
          Glossary
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
          Look up any quantum term, A to Z — each linked to the lesson that teaches it.
        </p>
        <div className="h-px bg-gradient-to-r from-gray-200/50 dark:from-gray-700/30 to-transparent mt-4 mb-4" />
        <div
          aria-hidden="true"
          className="flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 group-hover:text-accent dark:group-hover:text-accent-light transition-colors duration-200"
        >
          <span>Browse terms</span>
          <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </TransitionLink>
  );
}
```

Then append it as the final grid item in `web/src/app/page.tsx`. Add the import:

```tsx
import { GlossaryCard } from "@/components/glossary-card";
```

and add a final `<li>` immediately after the `{sections.map(...)}` block, inside the same `<ul>` (so it flows in the 3-column grid and continues the entrance stagger):

```tsx
            {sections.map((section, i) => (
              // ...existing SectionCard <li>...
            ))}
            <li
              className="animate-card-enter"
              style={{ animationDelay: `${600 + sections.length * 80}ms` }}
            >
              <GlossaryCard />
            </li>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- glossary-card.test`
Expected: PASS.

- [ ] **Step 5: Verify the home page still renders (existing home/page test, if any) and the suite is green**

Run: `npm test`
Expected: PASS — full suite green (existing + new).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/glossary-card.tsx web/src/app/page.tsx web/__tests__/components/glossary-card.test.tsx
git commit -m "feat(web): welcome-page glossary reference card"
```

---

### Task 8: Author the full term inventory + count gate + real-path verification

This task expands `GLOSSARY` from the seed to the full curated inventory (target ~75, gate ≥60), then verifies the whole feature on the real build path.

**Files:**
- Modify: `web/src/lib/glossary.ts` (expand `GLOSSARY`)
- Modify: `web/__tests__/lib/glossary.test.ts` (add the count gate)

**Authoring rules (apply to every entry):**
- 1–3 sentences, plain and precise; no emojis.
- Definitions are a single inline string; inline `code` and `$math$` only (use the `\ket{}` macro for kets). No block markdown.
- `section` = the curriculum section where the term is primarily taught (drives chip + link).
- Add `aliases` for symbols/abbreviations/alternate spellings users might search (e.g. `"VQE"`, `"CX"`).
- Add `seeAlso` only to other terms that exist in the inventory (the integrity test enforces this).
- **Accuracy is non-negotiable — this is educational content.** Verify each definition against the curriculum's own `GUIDE.md` files (e.g. `00-prereqs/GUIDE.md`, `05-quantum-chemistry/GUIDE.md`) and standard references before committing. (Subagent-driven execution should fan out authoring per section and run an adversarial fact-check pass over each definition; see the execution note at the end of this plan.)

**Inventory to author** (seed entries from Task 1 are marked ✓; author the rest, keeping all sorted-A–Z behavior automatic via helpers):

- **00-prereqs (Prerequisites):** Amplitude ✓, Unitary matrix ✓, Complex amplitude (alias of Amplitude — fold in, do not duplicate), Hilbert space, Inner product, Norm / normalization, Computational basis, Tensor product, Hermitian operator, Eigenvalue, Eigenvector, Dirac notation (aliases: bra-ket), Expectation value.
- **01-foundations (Foundations):** Qubit ✓, Superposition ✓, Measurement ✓, Born rule ✓, Bloch sphere ✓, Quantum gate, Pauli gates, Hadamard gate ✓, Phase gate, Rotation gate, CNOT gate ✓, Controlled gate, Quantum circuit, Entanglement ✓, Bell pair ✓, Global phase, Relative phase, Interference, No-cloning theorem, Statevector, Shots.
- **02-hardware (Hardware):** Amazon Braket, QPU, Quantum simulator (aliases: SV1, DM1, TN1), LocalSimulator, Qubit connectivity (aliases: topology), Native gate set, Transpilation, Coherence time (aliases: T1, T2), Decoherence, Noise model, Gate fidelity, Readout error, Trapped-ion qubit, Superconducting qubit, Neutral-atom qubit, Braket task.
- **03-algorithms (Algorithms):** Quantum algorithm, Oracle, Deutsch–Jozsa algorithm, Bernstein–Vazirani algorithm, Grover's algorithm, Amplitude amplification, Quantum Fourier transform (alias: QFT), Quantum phase estimation, Quantum teleportation, Superdense coding, Quantum speedup.
- **04-quantum-ml (Quantum ML):** Quantum machine learning (alias: QML), Ansatz ✓, Parameterized quantum circuit (alias: PQC), Variational quantum circuit (alias: VQC), PennyLane, Data encoding (aliases: feature map, angle encoding, amplitude encoding), Parameter-shift rule, Cost function (alias: loss function), Barren plateau, Expectation value (if not already under prereqs — keep one canonical entry).
- **05-quantum-chemistry (Chemistry):** Hamiltonian ✓, Variational quantum eigensolver ✓, Ground-state energy, Jordan–Wigner transformation, Second quantization, Fermionic operator, Pauli string, Trotterization (aliases: Trotter–Suzuki), Potential energy surface (alias: PES), OpenFermion, Hartree–Fock, Electronic structure.
- **06-hybrid-jobs (Hybrid Jobs):** Hybrid quantum-classical algorithm, Amazon Braket Hybrid Jobs, Classical optimizer, QAOA (alias: Quantum Approximate Optimization Algorithm), Cost Hamiltonian, Mixer Hamiltonian, Optimization loop, Checkpointing.

> Resolve any term that could sit in two sections to a single canonical entry (one `term`, one `section`) — the unique-term integrity test enforces no duplicates. "Expectation value" appears once (prefer `00-prereqs`).

- [ ] **Step 1: Add the count gate to the data test**

Append to `web/__tests__/lib/glossary.test.ts` inside the `"glossary data integrity"` describe:

```ts
  it("contains a comprehensive inventory (>= 60 terms)", () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(60);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- glossary.test`
Expected: FAIL — count assertion fails (seed has 14).

- [ ] **Step 3: Author the full inventory**

Expand `GLOSSARY` in `web/src/lib/glossary.ts` with the entries above, following the authoring rules. Keep the array readable (one entry per logical block). Do not reorder code for sorting — `sortedTerms`/`groupByLetter` handle display order.

- [ ] **Step 4: Run the data tests to verify they pass**

Run: `npm test -- glossary.test`
Expected: PASS — unique terms, valid sections, resolvable see-also, unique slugs, and `>= 60` all green. (If a `seeAlso` or duplicate fails, fix the data — the test names the offending term.)

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: PASS — entire Jest suite green.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Real-path verification — static export build**

Run: `npm run build`
Expected: build succeeds; `out/glossary/index.html` is emitted.

Then confirm the page actually rendered the content (not just compiled). Run:

```bash
test -f out/glossary/index.html && echo "page emitted"
grep -c "Qubit" out/glossary/index.html         # term present in pre-rendered HTML
grep -c "class=\"katex\"" out/glossary/index.html # KaTeX math actually rendered at build time
grep -c "/learn/01-foundations" out/glossary/index.html # category chip links emitted
```
Expected: the file exists, and each `grep -c` returns a non-zero count (terms, real KaTeX output, and lesson links are all present in the exported HTML). This is the real production render path — it confirms inline math and links work end-to-end, which the unit tests (mocked react-markdown) deliberately do not.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/glossary.ts web/__tests__/lib/glossary.test.ts
git commit -m "feat(web): author full glossary inventory (~75 terms) + count gate"
```

---

## Self-Review

**Spec coverage:**
- Data model / single source of truth → Task 1. ✓
- Section-taxonomy categorization (hue + label + lesson link) → Task 1 (data) + Task 3 (chip). ✓
- Inline `code` + `$math$` definitions via existing KaTeX stack → Task 2. ✓
- Page: search + sticky A–Z jump-nav + grouping + empty state + aria-live → Task 4. ✓
- `/glossary` route + SEO metadata → Task 5. ✓
- New footer with Glossary/Review/GitHub → Task 6. ✓
- Welcome-page reference card → Task 7. ✓
- Comprehensive authored content (≥60) → Task 8. ✓
- Tests (data integrity, component, footer, home) → Tasks 1,3,4,5,6,7,8. ✓
- A11y (labeled search, nav, aria-live, contrast guard via hue utilities) → Tasks 4 + 3. ✓
- Out of scope (no nav link, no per-term pages, no backend) → respected. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code; the only deferred-by-design item is per-definition prose in Task 8, which is bounded by an explicit, enumerated inventory + authoring rules + a count/integrity gate. ✓

**Type consistency:** `GlossaryTerm`, `SectionSlug`, `sectionShortLabel`, `termSlug`, `groupByLetter`, `matchesQuery`, `ALPHABET`, `InlineMarkdown`, `GlossaryEntry`, `Glossary`, `Footer`, `GlossaryCard` are defined once and consumed with matching signatures across tasks. Chip uses `hueFor(getSectionBySlug(slug).index)`; anchors use `termSlug` on both the entry `id` and see-also `href`. ✓

## Notes for the executor

- **Reduced motion:** the new components add no bespoke entrance animations beyond the home card reusing the existing `.animate-card-enter` (already `prefers-reduced-motion`-gated in globals.css). If you add any motion, gate it.
- **Recommended execution:** subagent-driven. Task 8's authoring + fact-check is the ideal place to fan out one author per curriculum section and an adversarial fact-checker per definition before the count gate — accuracy is the main risk in this plan.
