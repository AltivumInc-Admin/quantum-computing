/**
 * The /workspace data spine — ONE local read feeding every cockpit/work zone, so six
 * zones don't each run their own full localStorage scan on every qc-progress event.
 * readWorkspace() is impure (it reads storage, like runbook-dashboard's readLedger)
 * but is called from a single useSyncExternalStore-backed memo (hooks/use-workspace).
 * resolveValve() is PURE — the page's whole thesis is a deterministic function of
 * (due, tracked, sections, today), and it must be provable, so it lives apart.
 *
 * Every number here is single-sourced: mastery/retained/streak from runbook.ts, due
 * from review-store.ts, tiers from credentials.ts, the catalog from the manifest.
 * No thresholds, no dollar figures, no hand-copied constants.
 */

import {
  getAllCardIds,
  getCardState,
  getCardContent,
  KIND_LABELS,
  type CardKind,
} from "./review-store";
import { isDue, type CardState } from "./review-schedule";
import { activeDays } from "./activity-log";
import { isSectionComplete } from "./progress-store";
import {
  getManifestSections,
  humanizeNotebook,
  notebookHref,
  LAB_INDEX_HREF,
} from "./manifest";
import { hueFor } from "./sections";
import {
  streak,
  masteryCount,
  masteredThisWeek,
  freezesEarned,
  retentionSpectrum,
  daysUntilNextDue,
  dueRetained,
  type RetentionSpectrum,
} from "./runbook";
import { MASTERY_TIERS, CONSISTENCY_TIERS, nextUnearnedTier } from "./credentials";
import { getAllMeasurements } from "./skill-measure";
import { translate } from "@/i18n/translate";
import { readStoredLocale } from "@/i18n/storage";
import type { TFunction } from "@/i18n/types";

/** Below this many tracked cards the histogram is three thin bars and looks broken;
 *  Z1 shows an honest hairline list of intervals instead (which becomes the spectrum
 *  as data accrues). */
export const SPARSE_THRESHOLD = 5;

/** "Open the lab" with no specific notebook opens the JupyterLite lab landing —
 *  the same route NotebookLink deep-links into, now single-sourced in manifest.ts
 *  (which owns the manifest-derived link helpers) rather than spelled out twice. */
export const LAB_HREF = LAB_INDEX_HREF;

export interface WorkspaceNotebook {
  filename: string;
  /** Zero-padded index parsed from the filename's leading NN- (e.g. "01"). */
  index: string;
  /** Humanised title — filename minus extension and leading index, dashes → spaces. */
  label: string;
  /** The public lab route, path-encoded exactly as NotebookLink builds it. */
  href: string;
}

export interface WorkspaceSection {
  slug: string;
  dirName: string;
  title: string;
  index: number;
  notebookCount: number;
  runnableCount: number;
  done: boolean;
  hue: number;
  runnable: WorkspaceNotebook[];
}

export interface SparseCard {
  label: string;
  days: number;
}

export interface RecordRow {
  id: string;
  title: string;
  gates: number;
}

export interface ReachRung {
  title: string;
  current: number;
  target: number;
  distance: number;
  /** e.g. "in retention", "weeks" — never the sole carrier of meaning. */
  unit: string;
}

export type ValveKind = "review" | "continue" | "lab" | "start";

export interface ValveAction {
  kind: ValveKind;
  /** The context line above the button ("" for the review case — the count is the line). */
  headline: string;
  cta: string;
  href: string;
  /** The lab is a static route opened in a new tab; the rest are in-app Links. */
  external: boolean;
}

export interface DueKindRow {
  kind: CardKind | "unknown";
  label: string;
  count: number;
}

export interface WorkspaceModel {
  mastery: number;
  masteredThisWeek: number;
  spectrum: RetentionSpectrum;
  /** Non-null (the honest interval list) only below SPARSE_THRESHOLD tracked cards. */
  sparse: SparseCard[] | null;
  due: number;
  dueKinds: DueKindRow[];
  dueRetained: number;
  daysUntilNext: number | null;
  valve: ValveAction;
  sections: WorkspaceSection[];
  sectionsDone: number;
  sectionsTotal: number;
  /** Total browser-runnable notebooks across the curriculum — the Lab's honest count. */
  runnableTotal: number;
  records: RecordRow[];
  longestWeeks: number;
  reachMastery: ReachRung | null;
  reachConsistency: ReachRung | null;
}

/**
 * THE VALVE PRECEDENCE — the page's thesis as a pure function. The slot is NEVER
 * blank and NEVER congratulates; there is always exactly one action.
 *   1. due > 0               → "Review N cards"                         → /review
 *   2. due = 0, modules left  → "Nothing is due. Next Rep in N days."   → /learn/{next}
 *   3. due = 0, all complete  → same line                              → open the lab
 *   4. tracked = 0            → "You have not graded a Rep yet."        → /learn/00-prereqs
 * (4 is checked before 2/3: a learner who has graded nothing is sent to start, not
 * "continue", even though 00-prereqs is also their first incomplete module.)
 */
export function resolveValve(input: {
  due: number;
  tracked: number;
  daysUntilNext: number | null;
  firstIncomplete: { slug: string; title: string } | null;
  /** Optional translator; defaults to English so pure unit tests stay deterministic. */
  t?: TFunction;
}): ValveAction {
  const { due, tracked, daysUntilNext, firstIncomplete } = input;
  const t: TFunction =
    input.t ?? ((key, values, count) => translate("en", key, values, count));
  if (due > 0) {
    return {
      kind: "review",
      headline: "",
      cta: t("workspace.ctaReview", { count: due }, due),
      href: "/review",
      external: false,
    };
  }
  if (tracked === 0) {
    return {
      kind: "start",
      headline: t("workspace.headlineNoTracked"),
      cta: t("workspace.ctaStart"),
      href: "/learn/00-prereqs",
      external: false,
    };
  }
  const nextLine =
    daysUntilNext !== null
      ? t("workspace.headlineNextDue", { count: daysUntilNext }, daysUntilNext)
      : t("workspace.headlineNothingDue");
  if (firstIncomplete) {
    return {
      kind: "continue",
      headline: nextLine,
      cta: t("workspace.ctaContinue", { title: firstIncomplete.title }),
      href: `/learn/${firstIncomplete.slug}`,
      external: false,
    };
  }
  return {
    kind: "lab",
    headline: nextLine,
    cta: t("workspace.ctaLab"),
    href: LAB_HREF,
    external: true,
  };
}

/**
 * Read the whole local workspace once, for a given epoch-day `today`. Mirrors
 * runbook-dashboard.readLedger: impure, called only from the memo behind the one
 * external-store snapshot. activeDays is filtered to `d <= today` before the streak
 * kernel (the fast-clock guard both existing callers apply).
 */
export function readWorkspace(today: number): WorkspaceModel {
  // One scan of the card store: valid states + their content, id-aligned.
  const cards: { id: string; state: CardState; content: ReturnType<typeof getCardContent> }[] = [];
  for (const id of getAllCardIds()) {
    const state = getCardState(id);
    if (state) cards.push({ id, state, content: getCardContent(id) });
  }
  const states = cards.map((c) => c.state);

  const mastery = masteryCount(states);
  const spectrum = retentionSpectrum(states);
  const days = activeDays().filter((d) => d <= today);
  const longestWeeks = streak(days, today, freezesEarned(mastery)).longestWeeks;

  // Both the due set and its kind breakdown come from the `cards` array built
  // above, so the "one scan" comment is true: dueCardIds() would re-walk every
  // localStorage key and re-parse every CardState, and dueByKind() would then
  // call dueCardIds() a THIRD time and re-read content per due id. Those two
  // stay exported for the callers that genuinely have no scan in hand (the nav
  // badge, review-dashboard).
  const dueCards = cards.filter((c) => isDue(c.state, today));
  const dueIds = dueCards.map((c) => c.id);
  const due = dueIds.length;
  const kindCounts = {} as Record<CardKind | "unknown", number>;
  for (const c of dueCards) {
    // Own-property membership, mirroring review-store's kindBucket: `kind` is an
    // unchecked cast out of storage, so an unrecognized string (or a prototype
    // key) must collapse into "unknown" or it vanishes from the fixed row list
    // below while still counting toward `due`.
    const raw = c.content?.kind;
    const k: CardKind | "unknown" =
      raw && Object.hasOwn(KIND_LABELS, raw) ? (raw as CardKind) : "unknown";
    kindCounts[k] = (kindCounts[k] ?? 0) + 1;
  }
  const locale = readStoredLocale();
  const t: TFunction = (key, values, count) => translate(locale, key, values, count);
  const dueKinds: DueKindRow[] = ([...Object.keys(KIND_LABELS), "unknown"] as (CardKind | "unknown")[])
    .filter((k) => (kindCounts[k] ?? 0) > 0)
    .map((k) => ({
      kind: k,
      label:
        k === "unknown"
          ? t("review.kindLabels.unknown")
          : t(`review.kindLabels.${k as CardKind}`),
      count: kindCounts[k],
    }));

  // The catalog (build-time manifest) joined with local completion flags.
  const sections: WorkspaceSection[] = getManifestSections().map((s) => {
    const runnable = s.notebooks
      .filter((n) => n.runnable)
      .map((n) => {
        const { index, label } = humanizeNotebook(n.filename);
        return { filename: n.filename, index, label, href: notebookHref(s.dirName, n.filename) };
      });
    return {
      slug: s.slug,
      dirName: s.dirName,
      title: s.title,
      index: s.index,
      notebookCount: s.notebookCount,
      runnableCount: runnable.length,
      done: isSectionComplete(s.slug),
      hue: hueFor(s.index),
      runnable,
    };
  });
  const sectionsDone = sections.reduce((n, s) => (s.done ? n + 1 : n), 0);
  const runnableTotal = sections.reduce((n, s) => n + s.runnableCount, 0);
  const firstIncompleteSec = sections.find((s) => !s.done) ?? null;

  const valve = resolveValve({
    due,
    tracked: spectrum.tracked,
    daysUntilNext: daysUntilNextDue(states, today),
    firstIncomplete: firstIncompleteSec
      ? { slug: firstIncompleteSec.slug, title: firstIncompleteSec.title }
      : null,
    t,
  });

  // The sparse fallback: honest intervals when the histogram would look broken.
  const sparse =
    spectrum.tracked < SPARSE_THRESHOLD
      ? cards.map(({ state, content }) => ({
          label:
            (content?.kind ? `${KIND_LABELS[content.kind]} · ` : "") +
            (content?.prompt ?? "Recall card"),
          days: state.stability,
        }))
      : null;

  // Records: the shortest solutions found, titled from the graded prompt.
  const records: RecordRow[] = getAllMeasurements()
    .map(({ id, gates }) => ({
      id,
      title: getCardContent(id)?.prompt ?? humanizeNotebook(id).label ?? id,
      gates,
    }))
    .sort((a, b) => a.gates - b.gates)
    .slice(0, 5);

  const reachMastery = toRung(nextUnearnedTier(MASTERY_TIERS, mastery), mastery, "in retention");
  const reachConsistency = toRung(
    nextUnearnedTier(CONSISTENCY_TIERS, longestWeeks),
    longestWeeks,
    longestWeeks === 1 ? "week" : "weeks",
  );

  return {
    mastery,
    masteredThisWeek: masteredThisWeek(states, today),
    spectrum,
    sparse,
    due,
    dueKinds,
    dueRetained: dueRetained(states, today),
    daysUntilNext: daysUntilNextDue(states, today),
    valve,
    sections,
    sectionsDone,
    sectionsTotal: sections.length,
    runnableTotal,
    records,
    longestWeeks,
    reachMastery,
    reachConsistency,
  };
}

function toRung(
  next: { tier: { n: number; title: string }; distance: number } | null,
  current: number,
  unit: string,
): ReachRung | null {
  if (!next) return null;
  return { title: next.tier.title, current, target: next.tier.n, distance: next.distance, unit };
}
