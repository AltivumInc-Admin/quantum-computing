# Founding Ten Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue numbered Charter Member and Founding Patron badges that bind to a person, are publicly verifiable at a stable URL, and appear in the holder's account.

**Architecture:** A checked-in JSON registry is the single source of truth; git history is the issuance ledger. Badges bind on a SHA-256 of the normalized email (not the Cognito `sub`, which identifies an account record and changes on recreation or auth-method switch). Public roster and proof pages prerender under the existing static export; the account view matches client-side against a hash computed once in the auth bridge.

**Tech Stack:** Next.js 16 static export, React 19, Tailwind v4, Jest + Testing Library, Web Crypto (`crypto.subtle`) in the browser, `node:crypto` in scripts, AWS CLI in CodeBuild for the live check.

## Global Constraints

- **The repo is PUBLIC.** No email address, no Cognito `sub`, no other PII may be committed. Only `emailHash` and a consented display name.
- **Static export** (`output: "export"`). Every route must prerender; no request-time server. `next/image` does not optimize at build time.
- **Normalization is exactly** `email.trim().toLowerCase()`. No provider-specific rules.
- **These are conferred, not earned.** Copy must never imply study achievement. Do not add them to `MASTERY_TIERS`, `CONSISTENCY_TIERS`, `HARDWARE_TIERS`, or `computeCredentials`.
- **No emojis in UI** (project rule).
- Cohort keys are exactly `charter` and `patron`. Serials are integers 1–10.
- Spec: `docs/superpowers/specs/2026-07-29-founding-ten-badges-design.md`.

---

### Task 1: Registry, hashing, and integrity tests

**Files:**
- Create: `web/src/data/founding-ten.json`
- Create: `web/src/lib/founding-ten.ts`
- Test: `web/__tests__/lib/founding-ten.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Cohort = "charter" | "patron"`; `interface FoundingBadge { cohort: Cohort; serial: number; holder: string; issuedAt: string; emailHash: string }`; `normalizeEmail(email: string): string`; `hashEmail(email: string): Promise<string>`; `allBadges(): FoundingBadge[]`; `badgeBySlug(slug: string): FoundingBadge | null`; `badgeForEmailHash(hash: string): FoundingBadge[]`; `badgeSlug(b: FoundingBadge): string`; `COHORT_SIZE = 10`.

- [ ] **Step 1: Write the failing test**

```ts
/**
 * @jest-environment node
 */
import {
  normalizeEmail, hashEmail, allBadges, badgeBySlug,
  badgeForEmailHash, badgeSlug, COHORT_SIZE,
} from "@/lib/founding-ten";
import registry from "@/data/founding-ten.json";
import { existsSync } from "node:fs";
import path from "node:path";

describe("normalizeEmail", () => {
  it("lowercases and trims, so case and stray whitespace cannot detach a badge", () => {
    expect(normalizeEmail("  Charter.One@Example.Invalid ")).toBe("charter.one@example.invalid");
  });
});

describe("hashEmail", () => {
  it("matches a known SHA-256 vector", async () => {
    await expect(hashEmail("test@example.com")).resolves.toBe(
      "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b",
    );
  });

  it("is normalization-invariant", async () => {
    expect(await hashEmail(" TEST@Example.com ")).toBe(await hashEmail("test@example.com"));
  });
});

describe("registry integrity", () => {
  it("uses only the two known cohorts", () => {
    expect(Object.keys(registry).sort()).toEqual(["charter", "patron"]);
  });

  it("has unique serials within 1..10 per cohort", () => {
    for (const cohort of ["charter", "patron"] as const) {
      const serials = (registry[cohort] as { serial: number }[]).map((b) => b.serial);
      expect(new Set(serials).size).toBe(serials.length);
      for (const s of serials) {
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(COHORT_SIZE);
      }
    }
  });

  // The repo is public. A committed email or sub would be a permanent leak.
  it("contains no PII-shaped fields", () => {
    const raw = JSON.stringify(registry);
    expect(raw).not.toMatch(/"(email|sub|userId|username)"\s*:/);
    expect(raw).not.toMatch(/@/);
  });

  it("stores every emailHash as 64 hex characters", () => {
    for (const b of allBadges()) expect(b.emailHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses ISO dates", () => {
    for (const b of allBadges()) expect(b.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has artwork committed for every issued badge", () => {
    for (const b of allBadges()) {
      const base = path.join(process.cwd(), "public", "badges", badgeSlug(b));
      expect(existsSync(`${base}.png`)).toBe(true);
      expect(existsSync(`${base}.webp`)).toBe(true);
    }
  });
});

describe("lookup", () => {
  it("resolves a badge by its slug", () => {
    const first = allBadges()[0];
    if (!first) return; // empty registry is valid before the first issuance
    expect(badgeBySlug(badgeSlug(first))).toEqual(first);
  });

  it("returns null for an unissued slug", () => {
    expect(badgeBySlug("charter-09")).toBeNull();
  });

  it("finds nothing for an unknown hash", () => {
    expect(badgeForEmailHash("0".repeat(64))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx jest __tests__/lib/founding-ten.test.ts`
Expected: FAIL — `Cannot find module '@/lib/founding-ten'`

- [ ] **Step 3: Create the empty registry**

`web/src/data/founding-ten.json`:

```json
{
  "charter": [],
  "patron": []
}
```

- [ ] **Step 4: Write the implementation**

`web/src/lib/founding-ten.ts`:

```ts
// Numbered scarcity credentials — see
// docs/superpowers/specs/2026-07-29-founding-ten-badges-design.md
//
// These are CONFERRED by position in time, not earned by study. They are
// deliberately NOT part of credentials.ts, whose medals are all derived from
// synced progress under the rule "Each medal is earned, not awarded".
//
// A badge binds to a hash of the holder's EMAIL, never to their Cognito sub: a
// sub identifies an account RECORD, and this project has seen both ways that
// breaks — an account deleted and recreated gets a new sub, and the same person
// arriving via native vs Google sign-in gets two. Email survives both and both
// auth methods carry it as an ID-token claim.
//
// The hash is not a privacy guarantee (emails are enumerable, so a guess can be
// tested against this file); it exists so the PUBLIC repo holds no address. The
// holder's name is already public on their proof page by consent.

import registry from "@/data/founding-ten.json";

export const COHORT_SIZE = 10;

export type Cohort = "charter" | "patron";

export interface FoundingBadge {
  cohort: Cohort;
  serial: number;
  holder: string;
  issuedAt: string;
  emailHash: string;
}

export const COHORT_LABEL: Record<Cohort, string> = {
  charter: "Charter Member",
  patron: "Founding Patron",
};

/** Exactly trim + lowercase. No provider-specific rules (Gmail dot-stripping,
 *  +tag removal): those differ per provider and would make the hash impossible
 *  to reproduce by hand at issue time. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** SHA-256 hex of the normalized email. Uses Web Crypto so the same function
 *  runs in the browser; scripts/badge-email-hash.mjs must produce identical
 *  output (asserted by a shared known vector). */
export async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeEmail(email));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** "charter-01" — zero-padded so slugs sort and read like the artwork. */
export function badgeSlug(b: Pick<FoundingBadge, "cohort" | "serial">): string {
  return `${b.cohort}-${String(b.serial).padStart(2, "0")}`;
}

export function allBadges(): FoundingBadge[] {
  return (["charter", "patron"] as const).flatMap((cohort) =>
    (registry[cohort] as Omit<FoundingBadge, "cohort">[]).map((b) => ({ ...b, cohort })),
  );
}

export function badgeBySlug(slug: string): FoundingBadge | null {
  return allBadges().find((b) => badgeSlug(b) === slug) ?? null;
}

/** Every badge held by one person — a holder may have one per cohort. */
export function badgeForEmailHash(hash: string): FoundingBadge[] {
  return allBadges().filter((b) => b.emailHash === hash);
}

/** All ten slots of a cohort, issued or open — the roster's model. */
export function cohortSlots(cohort: Cohort): (FoundingBadge | null)[] {
  const issued = allBadges().filter((b) => b.cohort === cohort);
  return Array.from(
    { length: COHORT_SIZE },
    (_, i) => issued.find((b) => b.serial === i + 1) ?? null,
  );
}
```

- [ ] **Step 5: Make crypto.subtle available under Jest**

`crypto.subtle` exists on Node 20's global `crypto`, but the jsdom environment does not expose it. Add this to the top of any jsdom test that hashes:

```ts
import { webcrypto } from "node:crypto";
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
```

The Task 1 test declares `@jest-environment node`, so it needs no polyfill.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd web && npx jest __tests__/lib/founding-ten.test.ts`
Expected: PASS (the artwork and slug-lookup tests are vacuous while the registry is empty — Task 7 makes them bite)

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/founding-ten.ts web/src/data/founding-ten.json web/__tests__/lib/founding-ten.test.ts
git commit -m "feat(badges): Founding Ten registry, email-hash binding, integrity tests"
```

---

### Task 2: Artwork import

**Files:**
- Create: `web/public/badges/charter-01.png`, `web/public/badges/charter-01.webp`
- Delete: `badges/charter-member-01.png`, `badges/founding-patron-01.png` (after import)
- Modify: `.gitignore` — nothing; confirm `web/public/badges/` is not ignored

**Interfaces:**
- Consumes: `badgeSlug()` naming from Task 1.
- Produces: committed artwork at `web/public/badges/<slug>.png` and `.webp`.

- [ ] **Step 1: Import and rename the charter artwork**

```bash
cd /Users/cperez/dev/altivum-dev/quantum
mkdir -p web/public/badges
cp badges/charter-member-01.png web/public/badges/charter-01.png
```

Do NOT import `founding-patron-01.png` yet: no paying members exist, so patron 01 is unissued and an unissued serial must have no artwork (Task 1 asserts artwork only for issued rows; committing unused 1.8 MB assets is waste).

- [ ] **Step 2: Generate the 600×600 WebP derivative**

```bash
cd /Users/cperez/dev/altivum-dev/quantum
npx --yes sharp-cli@5 -i web/public/badges/charter-01.png \
  -o web/public/badges/charter-01.webp resize 600 600 --format webp
```

If `sharp-cli` is unavailable, `sips -Z 600 charter-01.png --out charter-01-600.png` then any PNG→WebP converter is acceptable; the only requirement is a 600×600 `.webp` at that exact path.

- [ ] **Step 3: Verify both files exist and the WebP is materially smaller**

```bash
ls -lh web/public/badges/
```
Expected: `charter-01.png` ~1.8M, `charter-01.webp` well under 200K.

- [ ] **Step 4: Remove the staging folder**

```bash
git rm -r --cached badges 2>/dev/null || true
rm -rf badges
```

The source PNGs now live at their committed path; keeping a second copy at the repo root would let the two drift.

- [ ] **Step 5: Commit**

```bash
git add web/public/badges
git commit -m "feat(badges): import Charter 01 artwork with WebP derivative"
```

---

### Task 3: Make /founding-ten public, and build the proof page

**Files:**
- Modify: `web/src/components/auth/auth-wall.tsx:16` (add to `PUBLIC_PREFIXES`)
- Create: `web/src/app/founding-ten/[badge]/page.tsx`
- Create: `web/src/components/founding-ten/badge-proof.tsx`
- Test: `web/__tests__/components/founding-ten/badge-proof.test.tsx`
- Test: `web/__tests__/components/auth/auth-wall.test.tsx` (extend)

**Interfaces:**
- Consumes: `badgeBySlug`, `badgeSlug`, `allBadges`, `COHORT_LABEL`, `COHORT_SIZE` from Task 1.
- Produces: `<BadgeProof badge={FoundingBadge} />`.

- [ ] **Step 1: Write the failing tests**

`web/__tests__/components/founding-ten/badge-proof.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { BadgeProof } from "@/components/founding-ten/badge-proof";

const badge = {
  cohort: "charter" as const,
  serial: 1,
  holder: "Irving Salinas",
  issuedAt: "2026-07-29",
  emailHash: "a".repeat(64),
};

describe("BadgeProof", () => {
  it("names the holder and the serial, which is what makes it verifiable", () => {
    render(<BadgeProof badge={badge} />);
    expect(screen.getByText("Irving Salinas")).toBeInTheDocument();
    expect(screen.getByText(/Charter Member/)).toBeInTheDocument();
    expect(screen.getByText(/01\s*\/\s*10/)).toBeInTheDocument();
  });

  it("shows the issue date as a machine-readable time element", () => {
    render(<BadgeProof badge={badge} />);
    expect(screen.getByText("29 July 2026").closest("time")).toHaveAttribute(
      "dateTime",
      "2026-07-29",
    );
  });

  // These are awarded for position in time. Claiming otherwise would devalue
  // the earned medals on /credentials, which are derived from real work.
  it("never claims the badge was earned through study", () => {
    const { container } = render(<BadgeProof badge={badge} />);
    expect(container.textContent).not.toMatch(/earned|mastery|achievement/i);
  });

  it("renders the artwork with a descriptive alt text", () => {
    render(<BadgeProof badge={badge} />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      "Charter Member badge, serial 01 of 10",
    );
  });
});
```

Extend `web/__tests__/components/auth/auth-wall.test.tsx` with:

```tsx
it("leaves the Founding Ten proof pages public — they are third-party verifiable", () => {
  expect(isPublicPathForTest("/founding-ten")).toBe(true);
  expect(isPublicPathForTest("/founding-ten/charter-01")).toBe(true);
});
```

If `isPublicPath` is not already exported for tests, render `<AuthWall>` at that pathname with `status: "unauthenticated"` and assert the child content renders rather than the gate screen — match whatever pattern that file already uses.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx jest __tests__/components/founding-ten __tests__/components/auth/auth-wall.test.tsx`
Expected: FAIL — module not found, and the auth-wall assertion returns false.

- [ ] **Step 3: Open the route publicly**

`web/src/components/auth/auth-wall.tsx`, modify line 16:

```ts
const PUBLIC_PREFIXES = ["/e2e-fixtures", "/founding-ten"];
```

Add to the comment block above it:

```
 * `/founding-ten/*` is proof of record: a third party verifying a holder's
 * credential must reach it without an account, so it cannot sit behind the wall.
```

- [ ] **Step 4: Write the proof component**

`web/src/components/founding-ten/badge-proof.tsx`:

```tsx
import { COHORT_LABEL, COHORT_SIZE, badgeSlug, type FoundingBadge } from "@/lib/founding-ten";

/** The public record for one issued badge. Deliberately plain: its job is to be
 *  checkable by someone who does not have an account and does not trust us. */
export function BadgeProof({ badge }: { badge: FoundingBadge }) {
  const label = COHORT_LABEL[badge.cohort];
  const serial = String(badge.serial).padStart(2, "0");
  const slug = badgeSlug(badge);
  const issued = new Date(`${badge.issuedAt}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  return (
    <article className="mx-auto max-w-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export: next/image does not optimize at build time, and the WebP derivative is pre-sized */}
      <img
        src={`/badges/${slug}.webp`}
        alt={`${label} badge, serial ${serial} of ${COHORT_SIZE}`}
        width={600}
        height={600}
        className="mx-auto w-full max-w-sm rounded-card"
      />

      <div className="mt-8 text-center">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-caption">
          {label} · {serial} / {COHORT_SIZE}
        </p>
        <h1 className="mt-2 font-display text-display-lg tracking-tight text-(--ink)">
          {badge.holder}
        </h1>
        <p className="mt-3 text-sm text-(--mut)">
          Issued <time dateTime={badge.issuedAt}>{issued}</time>
        </p>
      </div>

      <p className="mt-8 border-t border-(--bd) pt-6 text-sm text-(--mut)">
        This record certifies that {badge.holder} holds {label} {serial} of{" "}
        {COHORT_SIZE} on Quantum Learner. The {label.toLowerCase()} cohort is limited
        to {COHORT_SIZE} places and is conferred by order of joining, not by
        coursework.
      </p>

      <p className="mt-4 text-sm text-caption">
        <a href={`/badges/${slug}.png`} download className="hover:underline focus-ring rounded">
          Download the full-resolution badge
        </a>
      </p>
    </article>
  );
}
```

- [ ] **Step 5: Do NOT create the route here — it belongs to Task 7**

Next 16.2.6 hard-errors under `output: "export"` when a dynamic route's
`generateStaticParams()` returns `[]`, and the only bypass
(`export const revalidate = 0`) makes the exporter skip writing HTML
entirely — so once a badge IS issued its page silently 404s on a green build
(verified empirically: `next/dist/export/routes/app-page.js:60-80` returns
before `fileWriter.append`).

The route therefore lands in Task 7, together with the first real badge, so it
never exists without at least one param. Task 3 ships the component, its tests,
and the auth-wall opening only.

The route's code is kept here for reference; **Task 7 creates it**:

`web/src/app/founding-ten/[badge]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allBadges, badgeBySlug, badgeSlug, COHORT_LABEL, COHORT_SIZE } from "@/lib/founding-ten";
import { articleMetadata } from "@/lib/seo";
import { BadgeProof } from "@/components/founding-ten/badge-proof";

interface PageProps {
  params: Promise<{ badge: string }>;
}

export const dynamicParams = false;

/** Only ISSUED badges get a page — an open slot has no record to show. */
export function generateStaticParams() {
  return allBadges().map((b) => ({ badge: badgeSlug(b) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { badge: slug } = await params;
  const badge = badgeBySlug(slug);
  if (!badge) return { title: "Not Found" };
  const label = COHORT_LABEL[badge.cohort];
  const serial = String(badge.serial).padStart(2, "0");
  return articleMetadata({
    title: `${label} ${serial}/${COHORT_SIZE} — ${badge.holder}`,
    ogTitle: `${badge.holder} — ${label} ${serial}/${COHORT_SIZE}`,
    description: `Proof of record: ${badge.holder} holds ${label} ${serial} of ${COHORT_SIZE} on Quantum Learner, issued ${badge.issuedAt}.`,
    path: `/founding-ten/${slug}`,
  });
  // NOTE: unlike /glossary/[term], this page is deliberately INDEXABLE. It is
  // proof of record; a credential nobody can find is not proof of anything.
}

export default async function BadgeProofPage({ params }: PageProps) {
  const { badge: slug } = await params;
  const badge = badgeBySlug(slug);
  if (!badge) notFound();
  return (
    <div className="px-4 py-16">
      <BadgeProof badge={badge} />
    </div>
  );
}
```

- [ ] **Step 6: Run tests and build**

Run: `cd web && npx jest __tests__/components/founding-ten __tests__/components/auth/auth-wall.test.tsx && npm run lint && npm run build`
Expected: tests PASS, lint clean, build succeeds. With an empty registry `generateStaticParams` returns `[]` and no proof pages are emitted — that is correct.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/founding-ten web/src/components/founding-ten web/src/components/auth/auth-wall.tsx web/__tests__
git commit -m "feat(badges): public proof-of-record pages for issued badges"
```

---

### Task 4: Public roster

**Files:**
- Create: `web/src/app/founding-ten/page.tsx`
- Create: `web/src/components/founding-ten/roster.tsx`
- Test: `web/__tests__/components/founding-ten/roster.test.tsx`

**Interfaces:**
- Consumes: `cohortSlots`, `badgeSlug`, `COHORT_LABEL`, `COHORT_SIZE` from Task 1.
- Produces: `<Roster />`.

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { Roster } from "@/components/founding-ten/roster";

jest.mock("@/lib/founding-ten", () => {
  const actual = jest.requireActual("@/lib/founding-ten");
  return {
    ...actual,
    cohortSlots: (cohort: "charter" | "patron") =>
      cohort === "charter"
        ? [
            { cohort: "charter", serial: 1, holder: "Irving Salinas", issuedAt: "2026-07-29", emailHash: "a".repeat(64) },
            ...Array(9).fill(null),
          ]
        : Array(10).fill(null),
  };
});

describe("Roster", () => {
  it("names an issued holder and links to their proof page", () => {
    render(<Roster />);
    const link = screen.getByRole("link", { name: /Irving Salinas/ });
    expect(link).toHaveAttribute("href", "/founding-ten/charter-01");
  });

  it("shows every unissued slot as open, so the scarcity is countable", () => {
    render(<Roster />);
    // 9 open charter + 10 open patron
    expect(screen.getAllByText(/open/i)).toHaveLength(19);
  });

  it("renders both cohorts with all ten slots each", () => {
    render(<Roster />);
    const charter = screen.getByRole("region", { name: /charter member/i });
    expect(within(charter).getAllByRole("listitem")).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx jest __tests__/components/founding-ten/roster.test.tsx`
Expected: FAIL — `Cannot find module '@/components/founding-ten/roster'`

- [ ] **Step 3: Write the roster component**

`web/src/components/founding-ten/roster.tsx`:

```tsx
import Link from "next/link";
import { COHORT_LABEL, COHORT_SIZE, badgeSlug, cohortSlots, type Cohort } from "@/lib/founding-ten";

const COHORTS: Cohort[] = ["charter", "patron"];

const BLURB: Record<Cohort, string> = {
  charter: "The first ten members. Conferred by order of joining.",
  patron: "The first ten paying members. Conferred by order of subscribing.",
};

/** The whole cohort, issued and open. Showing the empty slots is the point:
 *  scarcity you can count is a claim a reader can check for themselves. */
export function Roster() {
  return (
    <div className="space-y-14">
      {COHORTS.map((cohort) => (
        <section key={cohort} aria-label={COHORT_LABEL[cohort]}>
          <h2 className="font-display text-display-md tracking-tight text-(--ink)">
            {COHORT_LABEL[cohort]}
          </h2>
          <p className="mt-1 text-sm text-(--mut)">{BLURB[cohort]}</p>

          <ul className="mt-6 divide-y divide-(--bd) border-y border-(--bd)">
            {cohortSlots(cohort).map((badge, i) => {
              const serial = String(i + 1).padStart(2, "0");
              return (
                <li key={serial} className="flex items-baseline justify-between gap-4 py-3">
                  <span className="font-mono text-sm tabular-nums text-caption">
                    {serial} / {COHORT_SIZE}
                  </span>
                  {badge ? (
                    <Link
                      href={`/founding-ten/${badgeSlug(badge)}`}
                      className="text-sm text-(--ink) hover:underline focus-ring rounded"
                    >
                      {badge.holder}
                    </Link>
                  ) : (
                    <span className="text-sm text-caption">Open</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

`web/src/app/founding-ten/page.tsx`:

```tsx
import type { Metadata } from "next";
import { articleMetadata } from "@/lib/seo";
import { Roster } from "@/components/founding-ten/roster";

export const metadata: Metadata = articleMetadata({
  title: "The Founding Ten — Quantum Learner",
  ogTitle: "The Founding Ten",
  description:
    "Ten charter members and ten founding patrons. Each place is numbered, issued once, and publicly verifiable.",
  path: "/founding-ten",
});

export default function FoundingTenPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-display-lg tracking-tight text-(--ink)">
        The Founding Ten
      </h1>
      <p className="mt-3 text-sm text-(--mut)">
        Twenty numbered places, issued once and never reissued. Every badge has a
        public record, and every unclaimed place is shown as open.
      </p>
      <div className="mt-12">
        <Roster />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests, lint, build**

Run: `cd web && npx jest __tests__/components/founding-ten && npm run lint && npm run build`
Expected: PASS / clean / succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/founding-ten web/src/components/founding-ten web/__tests__/components/founding-ten
git commit -m "feat(badges): public Founding Ten roster"
```

---

### Task 5: Account view — emailHash plumbing and the conferred group

**Files:**
- Modify: `web/src/components/auth/auth-provider.tsx` (add `emailHash` to context)
- Modify: `web/src/components/auth/amplify-auth-bridge.tsx` (compute it on hydrate)
- Create: `web/src/components/founding-ten/my-badges.tsx`
- Modify: `web/src/components/credentials-wall.tsx` (mount above the earned medals)
- Test: `web/__tests__/components/founding-ten/my-badges.test.tsx`

**Interfaces:**
- Consumes: `hashEmail`, `badgeForEmailHash`, `badgeSlug`, `COHORT_LABEL`, `COHORT_SIZE` from Task 1; `useAuth()` from `auth-provider`.
- Produces: `AuthContextValue.emailHash: string | null`; `<MyFoundingBadges />`.

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { MyFoundingBadges } from "@/components/founding-ten/my-badges";

const HASH = "b".repeat(64);
let mockAuth: { status: string; email: string | null; emailHash: string | null } = {
  status: "authenticated", email: "charter-01@example.invalid", emailHash: HASH,
};
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

jest.mock("@/lib/founding-ten", () => {
  const actual = jest.requireActual("@/lib/founding-ten");
  return {
    ...actual,
    badgeForEmailHash: (h: string) =>
      h === "b".repeat(64)
        ? [{ cohort: "charter", serial: 1, holder: "Irving Salinas", issuedAt: "2026-07-29", emailHash: h }]
        : [],
  };
});

describe("MyFoundingBadges", () => {
  it("shows the holder's badge with a link to its public record", () => {
    render(<MyFoundingBadges />);
    expect(screen.getByText(/Charter Member/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /public record/i })).toHaveAttribute(
      "href",
      "/founding-ten/charter-01",
    );
  });

  it("renders nothing for someone who holds no badge", () => {
    mockAuth = { status: "authenticated", email: "nobody@example.com", emailHash: "c".repeat(64) };
    const { container } = render(<MyFoundingBadges />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before the hash resolves", () => {
    mockAuth = { status: "authenticated", email: "x@y.com", emailHash: null };
    const { container } = render(<MyFoundingBadges />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx jest __tests__/components/founding-ten/my-badges.test.tsx`
Expected: FAIL — `Cannot find module '@/components/founding-ten/my-badges'`

- [ ] **Step 3: Extend the auth context**

In `web/src/components/auth/auth-provider.tsx`, make these four edits:

```tsx
// 1. the context shape
interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  emailHash: string | null; // SHA-256 of the normalized email; see lib/founding-ten
  signOut: () => Promise<void>;
}

// 2. the default
const AuthContext = createContext<AuthContextValue>({
  status: "unconfigured",
  email: null,
  emailHash: null,
  signOut: async () => {},
});

// 3. state beside `email`
const [emailHash, setEmailHash] = useState<string | null>(null);

// 4. pass the setter down and publish it
<AmplifyAuthBridge
  onStatus={setStatus}
  onEmail={setEmail}
  onEmailHash={setEmailHash}
  registerSignOut={registerSignOut}
/>
// ...
<AuthContext.Provider value={{ status, email, emailHash, signOut }}>
```

Then widen the bridge's `Props` in `web/src/components/auth/amplify-auth-bridge.tsx`:

```tsx
interface Props {
  onStatus: (s: AuthStatus) => void;
  onEmail: (e: string | null) => void;
  onEmailHash: (h: string | null) => void;
  registerSignOut: (fn: () => Promise<void>) => void;
}
```

and add `onEmailHash` to the `useCallback`/`useEffect` dependency arrays alongside `onEmail`.

Compute it in the bridge rather than the view: hydrate is already async there, so the view stays synchronous and no component needs a `setState` inside an effect (the project's ESLint forbids it — see `react-hooks/set-state-in-effect`).

In `web/src/components/auth/amplify-auth-bridge.tsx`, inside `hydrate()` after the email claim is read:

```ts
// Hash here, not in the view: this function is already async, so the account
// surface can stay synchronous. Badge binding uses the EMAIL (see
// lib/founding-ten) because a sub does not survive account recreation.
const emailClaim = typeof claim === "string" ? claim : null;
const hash = emailClaim ? await hashEmail(emailClaim) : null;
if (seq !== seqRef.current) return;
onEmailHash(hash);
```

Set `onEmailHash(null)` everywhere `onEmail(null)` is already called (the catch branch, `registerSignOut`, and the `signedOut` / `tokenRefresh_failure` / `signInWithRedirect_failure` Hub cases).

- [ ] **Step 4: Write the account component**

`web/src/components/founding-ten/my-badges.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { COHORT_LABEL, COHORT_SIZE, badgeForEmailHash, badgeSlug } from "@/lib/founding-ten";

/** The holder's own badges, above the earned medals and visually apart from
 *  them. Copy says CONFERRED, never earned: the medals below are derived from
 *  real work, and blurring the two would cheapen them. */
export function MyFoundingBadges() {
  const { emailHash } = useAuth();
  const badges = emailHash ? badgeForEmailHash(emailHash) : [];
  if (badges.length === 0) return null;

  return (
    <section aria-label="Founding Ten" className="mb-12">
      <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-caption">
        Founding Ten
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {badges.map((badge) => {
          const slug = badgeSlug(badge);
          const serial = String(badge.serial).padStart(2, "0");
          return (
            <div
              key={slug}
              className="flex items-center gap-4 rounded-card border border-gray-200/60 bg-(--surface-1) p-4 shadow-(--shadow-resting) dark:border-white/[0.06]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
              <img
                src={`/badges/${slug}.webp`}
                alt=""
                width={96}
                height={96}
                className="size-24 shrink-0 rounded-control"
              />
              <div className="min-w-0">
                <p className="font-display text-sm text-(--ink)">
                  {COHORT_LABEL[badge.cohort]} {serial} / {COHORT_SIZE}
                </p>
                <p className="mt-0.5 text-sm text-(--mut)">
                  Conferred {badge.issuedAt}
                </p>
                <Link
                  href={`/founding-ten/${slug}`}
                  className="mt-2 inline-block text-sm text-accent-dark hover:underline focus-ring rounded dark:text-accent-light"
                >
                  View public record
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Mount it above the earned medals**

In `web/src/components/credentials-wall.tsx`, render `<MyFoundingBadges />` as the first child of the wall's root, before the existing medal groups.

- [ ] **Step 6: Run the full suite, lint, build**

Run: `cd web && npm test && npm run lint && npm run build`
Expected: all suites pass (existing auth-provider and bridge tests must still pass — if they assert the context shape, extend them rather than loosening the assertion), lint clean, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web/src/components web/__tests__
git commit -m "feat(badges): show a holder's Founding Ten badge in their account"
```

---

### Task 6: Issuance script and the live CI check

**Files:**
- Create: `scripts/badge-email-hash.mjs`
- Create: `scripts/verify-founding-ten.mjs`
- Modify: `infra/ci-standby/template.yaml` (add the check to the inline buildspec)
- Test: `web/__tests__/lib/founding-ten.test.ts` (extend with a cross-implementation vector)

**Interfaces:**
- Consumes: `normalizeEmail` semantics from Task 1.
- Produces: `node scripts/badge-email-hash.mjs <email>` prints the hex hash; `node scripts/verify-founding-ten.mjs` exits non-zero when an issued badge matches no enabled Cognito user.

- [ ] **Step 1: Write the failing cross-implementation test**

Append to `web/__tests__/lib/founding-ten.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import path from "node:path";

it("the issuance script produces the same hash as the browser function", async () => {
  const script = path.join(process.cwd(), "..", "scripts", "badge-email-hash.mjs");
  const cli = execFileSync("node", [script, "  Test@Example.com "]).toString().trim();
  expect(cli).toBe(await hashEmail("test@example.com"));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx jest __tests__/lib/founding-ten.test.ts -t "issuance script"`
Expected: FAIL — script does not exist.

- [ ] **Step 3: Write the hash script**

`scripts/badge-email-hash.mjs`:

```js
#!/usr/bin/env node
// Prints the emailHash for a Founding Ten registry row.
//   node scripts/badge-email-hash.mjs "someone@example.com"
// Normalization must stay identical to normalizeEmail() in
// web/src/lib/founding-ten.ts — a shared known vector asserts it.
import { createHash } from "node:crypto";

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/badge-email-hash.mjs <email>");
  process.exit(2);
}
process.stdout.write(createHash("sha256").update(email.trim().toLowerCase()).digest("hex"));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx jest __tests__/lib/founding-ten.test.ts`
Expected: PASS

- [ ] **Step 5: Write the live verification script**

`scripts/verify-founding-ten.mjs`:

```js
#!/usr/bin/env node
// Fails the build if an issued badge no longer matches an enabled Cognito user.
//
// This is what stops a badge detaching SILENTLY. Binding on the email means a
// holder who deletes and recreates their account keeps the badge automatically;
// a holder who CHANGES their email turns the build red instead of vanishing.
//
// Skips (exit 0) when AWS credentials are absent, so `npm test` still runs
// offline — the live check is a CI-only gate.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const POOL_ID = process.env.QUANTUM_USER_POOL_ID ?? "us-east-2_aRydPmAjj";
const REGION = process.env.AWS_REGION ?? "us-east-2";

const registry = JSON.parse(readFileSync(new URL("../web/src/data/founding-ten.json", import.meta.url)));
const issued = [...registry.charter, ...registry.patron];
if (issued.length === 0) {
  console.log("founding-ten: no badges issued, nothing to verify");
  process.exit(0);
}

let users;
try {
  const raw = execFileSync("aws", [
    "cognito-idp", "list-users",
    "--user-pool-id", POOL_ID,
    "--region", REGION,
    "--output", "json",
  ], { stdio: ["ignore", "pipe", "pipe"] }).toString();
  users = JSON.parse(raw).Users ?? [];
} catch {
  console.log("founding-ten: no AWS credentials, skipping the live check");
  process.exit(0);
}

const live = new Set(
  users
    .filter((u) => u.Enabled)
    .map((u) => u.Attributes.find((a) => a.Name === "email")?.Value)
    .filter(Boolean)
    .map((e) => createHash("sha256").update(e.trim().toLowerCase()).digest("hex")),
);

const orphans = issued.filter((b) => !live.has(b.emailHash));
if (orphans.length > 0) {
  for (const b of orphans) {
    console.error(`founding-ten: serial ${b.serial} (${b.holder}) matches no enabled user`);
  }
  console.error("Repair: recompute the hash for the holder's current email and update the registry.");
  process.exit(1);
}
console.log(`founding-ten: all ${issued.length} issued badge(s) resolve to live users`);
```

- [ ] **Step 6: Run it locally**

Run: `node scripts/verify-founding-ten.mjs`
Expected: `founding-ten: no badges issued, nothing to verify` (registry is still empty until Task 7).

- [ ] **Step 7: Add it to the standby CI buildspec**

In `infra/ci-standby/template.yaml`, add to the build phase commands, after the web test step:

```yaml
- node scripts/verify-founding-ten.mjs
```

The buildspec is inline in the template on purpose, so redeploy the stack for this to take effect:

```bash
aws cloudformation deploy \
  --stack-name quantum-ci-standby \
  --template-file infra/ci-standby/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-2
```

Note in `infra/ci-standby/README.md` that the project's CodeBuild role needs `cognito-idp:ListUsers` on the pool; add it to the role's policy in the same template if absent.

- [ ] **Step 8: Commit**

```bash
git add scripts infra/ci-standby web/__tests__/lib/founding-ten.test.ts
git commit -m "feat(badges): issuance hash script and a live CI check against Cognito"
```

---

### Task 7: Issue Charter 01 to Irving Salinas

**Files:**
- Modify: `web/src/data/founding-ten.json`
- Create: `web/src/app/founding-ten/[badge]/page.tsx` (moved here from Task 3 — see that task's Step 5 for the exact code and the reason)
- Modify: `web/src/app/sitemap.ts` (add `/founding-ten` and every issued badge URL)

**Interfaces:**
- Consumes: everything above.
- Produces: the first issued badge; makes Task 1's artwork and slug assertions non-vacuous.

**Why the route lands here:** it must never exist with an empty registry. Create
it in the same commit as the first badge, with NO `export const revalidate`.
After building, confirm the route table shows `● /founding-ten/[badge]` (SSG,
not `ƒ Dynamic`) and that `web/out/founding-ten/charter-01.html` exists — a green
build alone does not prove the page was emitted.

**Sitemap:** the proof pages are indexable but currently unreachable by a
crawler — `src/app/sitemap.ts` lists only `""`, `/pricing`, `/privacy`. Add
`/founding-ten` plus one entry per issued badge, so "a credential nobody can
find is not proof" actually holds.

**GATE — do not run this task until the human confirms:**
1. Irving Salinas has agreed to be **named publicly**. Git history makes this effectively permanent; removal is a PR but the log retains the name.
2. The holder's exact Cognito email has been confirmed directly with them. It is supplied at the shell in Step 1 below and must never be typed into this plan, the registry, or any commit — only its hash is.

- [ ] **Step 1: Compute the hash**

```bash
node scripts/badge-email-hash.mjs "<holder-email>"
```
Pass the confirmed address as a shell argument — do not paste it into any file. Expected: a 64-hex SHA-256 string printed to stdout; paste that string (not the address) into the registry row in Step 2.

- [ ] **Step 2: Add the registry row**

`web/src/data/founding-ten.json`:

```json
{
  "charter": [
    {
      "serial": 1,
      "holder": "Irving Salinas",
      "issuedAt": "2026-07-29",
      "emailHash": "<paste the hash printed by Step 1>"
    }
  ],
  "patron": []
}
```

- [ ] **Step 3: Verify against live Cognito**

Run: `node scripts/verify-founding-ten.mjs`
Expected: `founding-ten: all 1 issued badge(s) resolve to live users`

- [ ] **Step 4: Run the full gate**

Run: `cd web && npm test && npm run lint && npm run build`
Expected: all pass. The build now emits `/founding-ten/charter-01`; confirm it appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add web/src/data/founding-ten.json
git commit -m "feat(badges): issue Charter Member 01/10 to Irving Salinas"
```

---

## Verification

After all tasks:

```bash
cd web && npm test && npm run lint && npm run build
node ../scripts/verify-founding-ten.mjs
```

Then, on the deployed site:
- `/founding-ten` lists Charter 01 as Irving Salinas and nineteen open slots.
- `/founding-ten/charter-01` renders the badge, the name, and the issue date **while signed out** (it is proof for third parties).
- Signing in as the holder shows the badge on `/credentials` above the earned medals.
- Signing in as anyone else shows no Founding Ten section at all.
