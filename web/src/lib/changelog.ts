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
 *    SEO reach. The ban list lives in __tests__/_support/changelog-ban-list.ts
 *    and is run over three surfaces: these strings, the rendered page in both
 *    locales, and the page's metadata export.
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
    id: "2026-08-24-after-dark-redesign",
    shipped: "2026-08-24",
    kind: "improved",
    title: "A new look, and a curriculum you can steer",
    body: "Quantum Learner has been redrawn: a deep green-black ground, a gold accent kept for the things worth noticing, and a new |Q⟩ mark. The welcome page's curriculum is now a dial — choose any section number and the needle moves to it with a short description, so you can weigh a module before you open it. Everything reads the same way in both themes.",
    href: "/",
  },
  {
    id: "2026-08-20-example-scripts-correctness",
    shipped: "2026-08-20",
    kind: "fixed",
    title: "Grover and VQE example scripts no longer give silently wrong answers",
    body: "The Grover's search example returned an even spread instead of finding the marked item on circuits of four or more qubits, and the VQE example could mislabel measurement results when a circuit skipped a qubit. Both now compute the correct answer at any size — or stop with a clear error rather than report a wrong number.",
  },
  {
    id: "2026-08-20-kernel-explorer-convention",
    shipped: "2026-08-20",
    kind: "fixed",
    title: "The kernel explorer now prepares the same states as the course library",
    body: "The interactive kernel widget encoded data with a different feature-map convention than the one the course teaches, so the same inputs produced different quantum states in the widget and in your own code. They now match exactly, and the scale slider reaches further so you can watch where over-encoding really begins.",
    href: "/learn/04-quantum-ml",
    section: "04-quantum-ml",
  },
  {
    id: "2026-08-20-changelog-page",
    shipped: "2026-08-20",
    kind: "new",
    title: "A public record of what changes here",
    body: "This page lists what is new, what got better, and what got fixed, newest first, in English and in Spanish. It is open to anyone — no account needed. The record begins with this entry; nothing before it is listed.",
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
 *
 * `pr` is the PULL REQUEST's own number, which does not exist until the pull
 * request does — and the guard fails on the first push, before that. So the
 * order is: push, open the pull request, read the number off it, add the line,
 * push again. The first red check is the expected path here, not a mistake.
 */
export const SILENT: readonly SilentChange[] = [
  {
    pr: 244,
    reason:
      "Alignment corrections to the welcome dial — the needle now points at its own graduation, the hero holds the fold in English as it already did in Spanish, and the readout sits with the composition. A learner CAN see these, but they land the same day as 2026-08-24-after-dark-redesign and only make that entry's description true; a second entry saying the dial was fixed hours after it was announced is noise, not news.",
  },
];

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
