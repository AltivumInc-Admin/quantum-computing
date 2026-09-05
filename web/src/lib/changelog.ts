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
    id: "2026-09-04-fleet-that-exists",
    shipped: "2026-09-04",
    kind: "fixed",
    title: "The device pages now describe the machines Amazon Braket actually has",
    body: "The device tables, the cost estimator and the hybrid-job backend picker had drifted away from the real fleet. Several machines AWS has since retired were still listed as though you could send them work, and four that are live \u2014 IonQ's Forte Enterprise, IQM's Emerald, AQT's IBEX Q1 and Rigetti's Cepheus \u2014 had no entry at all. Every device now carries its true status, a retired one says so plainly instead of quietly vanishing, and the estimator prices only what exists. The hardware lesson, the glossary and the affected notebooks were corrected to match, and a nightly check now compares the tables against Amazon Braket so they cannot drift again unnoticed.",
    href: "/learn/02-hardware",
    section: "02-hardware",
  },
  {
    id: "2026-09-04-privacy-lists-every-total",
    shipped: "2026-09-04",
    kind: "improved",
    title: "The privacy policy now lists every daily total we keep",
    body: "Our servers keep a small daily tally of how the site is used, worked out after the fact from ordinary web-host access logs and containing no addresses, no identifiers and nothing that links one day to another. We have started counting more than before: alongside how many people arrived and how many signed in, the tally now also records how many opened each lesson notebook, how many opened each course section, how many sections a day's visitors reached, and which section that day's readers got furthest into. We want to know whether the curriculum is actually being read to the end. Nothing was added to the page to do it \u2014 no script, no cookie, no identifier \u2014 and the policy names every one of these totals before the first is kept.",
    href: "/privacy",
  },
  {
    id: "2026-09-03-google-sign-in-stall",
    shipped: "2026-09-03",
    kind: "fixed",
    title: "Signing in with Google no longer stalls, or claims it failed when it worked",
    body: "Signing in with Google could sit on \"Signing you in…\" for fifteen seconds, show \"Google sign-in didn't complete\", and then sign you in anyway a moment later. A leftover marker from any earlier Google attempt you did not finish — a back button, a closed tab, a browser restart part-way through — was blocking the check that confirms who you are, and the error was really just the page giving up waiting. The leftover is now cleared before anything waits on it. Two related fixes: the page only says sign-in failed when it actually did, and if you were sent to sign in from a lesson, Google now returns you to that lesson instead of the workspace.",
    href: "/login",
  },
  {
    id: "2026-09-03-notebooks-that-teach",
    shipped: "2026-09-03",
    kind: "improved",
    title: "The lesson notebooks explain themselves",
    body: "Every notebook in the curriculum has been rewritten to teach, not just to label. Each section now says what the code is about to show, what to look for in the result, and the mistake it is steering you around \u2014 with the honest caveats included, so you learn where each idea stops working as well as where it starts. The exercises, hints and self-checks are unchanged.",
    href: "/learn/00-prereqs",
    section: "00-prereqs",
  },
  {
    id: "2026-09-02-pricing-page-reads-right",
    shipped: "2026-09-02",
    kind: "fixed",
    title: "The pricing page reads right in Spanish, and says only what is true",
    body: "Every credit figure on the Spanish pricing page is now written the Spanish way, with the Spanish word and the Spanish thousands separator, and each plan's bullet points take their numbers from the same table as the prices, so the two can no longer disagree. The description search engines show for the page no longer makes a pricing claim the wallet does not implement. For screen-reader and keyboard users: the preset buttons announce which one is selected, both rate tables have names, the hardware table scrolls from the keyboard, and the highlighted plan's badge is readable in the dark theme.",
    href: "/pricing",
  },
  {
    id: "2026-08-31-learner-quantumenv-dev",
    shipped: "2026-08-31",
    kind: "improved",
    title: "Quantum Learner joins the Quantum Env platform",
    body: "The site's home address is now learner.quantumenv.dev, alongside the other Quantum Env apps. The previous address, quantumlearner.dev, forwards here automatically, and every bookmark and shared link keeps working. Sign-in is unchanged, including Google.",
    href: "/",
  },
  {
    id: "2026-08-30-black-and-gold",
    shipped: "2026-08-30",
    kind: "improved",
    title: "Black and gold",
    body: "The green is gone: Quantum Learner now sits on a true black ground, with the gold accent doing the same quiet work as before. The daylight theme brightened to a warm white with near-black ink. Nothing moved and nothing changed meaning — every page, chart, and icon simply wears the new coat, in both themes.",
    href: "/",
  },
  {
    id: "2026-08-29-canonical-domain",
    shipped: "2026-08-29",
    kind: "improved",
    title: "Quantum Learner lives at quantumlearner.dev now",
    body: "The site's home address is now quantumlearner.dev. The old address, quantum.altivum.ai, forwards here automatically, and every bookmark and shared link keeps working. If you signed in with an email and password you will be asked to reset your password once; Google sign-in is unchanged.",
    href: "/",
  },
  {
    id: "2026-08-28-hardware-lesson-copy",
    shipped: "2026-08-28",
    kind: "fixed",
    title: "The hardware lesson now says plainly what is available today",
    body: "The 02-hardware guide and the project README still described a free hardware perk that had been withdrawn. Both now say it straight: everything in the lesson works free in your browser against the simulator, and using a real QPU today takes an AWS account of your own, billed directly by AWS.",
    href: "/learn/02-hardware",
    section: "02-hardware",
  },
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
    pr: 254,
    reason:
      "The last link of the same shrink chain PR 253 fixed: flex on the account menu's wrapper so the button inside follows the wrapper's compression instead of parking its chevron under the language globe. Same-night polish of 2026-08-30-black-and-gold, same PR 244 precedent.",
  },
  {
    pr: 253,
    reason:
      "One class on the account menu's wrapper div (min-w-0) so the signed-in email chip can compress instead of pushing the nav's action rail across the centered pill. A learner CAN see the un-breaking, but it lands the night 2026-08-30-black-and-gold was announced and only makes that entry's description true — the same-day-polish precedent PR 244 set.",
  },
  {
    pr: 246,
    reason:
      "Repository hygiene with no learner-visible surface: the git filter that strips notebook outputs was pointing at an interpreter in a checkout that no longer existed, and nothing versioned enforced stripping at all. Adds a run-time-resolving filter wrapper, a `make git-filters` target, and the CI guard that makes it a guarantee rather than per-machine config. The curriculum notebooks a learner reads are byte-identical before and after.",
  },
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
