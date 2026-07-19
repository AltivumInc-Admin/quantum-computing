"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { subscribe, getAllCardStates, dueCount } from "@/lib/review-store";
import { activeDays } from "@/lib/activity-log";
import { completedCount } from "@/lib/progress-store";
import { getSections } from "@/lib/sections";
import { epochDay } from "@/lib/review-schedule";
import {
  streak,
  masteryCount,
  masteredThisWeek,
  freezesEarned,
  contributionCells,
  weekOf,
  RETENTION_STABILITY,
  type ContributionCell,
} from "@/lib/runbook";

/**
 * The Runbook: a Linear/GitHub-register progress ledger. It renders nothing but
 * data the learner has already earned — mastery (the North-Star "skills in
 * proven retention"), a weekly streak with an earned freeze, and a 26-week
 * contribution graph — all derived client-side from the synced qc:* store.
 *
 * State is read through useSyncExternalStore so the static export prerenders an
 * inert empty shell and the real ledger hydrates from localStorage (mirrors
 * ReviewDashboard). The snapshot is a compact fingerprint that changes on any
 * grade / activity / section write (all of which fire the qc-progress event).
 */

const WEEKS = 26;
// The server / first-paint value. Its leading "0" epoch-day marks "no data yet"
// (a real client snapshot always carries today's non-zero epoch-day).
const SERVER_SNAPSHOT = "0|0|0|0|0";

// Date.now() lives here — the external-store read, where impurity is sanctioned
// (the same edge review-store.dueCardIds uses). `today` changes only at the UTC
// day boundary, so the snapshot stays stable within a day.
function snapshot(): string {
  try {
    const today = epochDay(Date.now());
    const states = getAllCardStates();
    let stabilitySum = 0;
    for (const s of states) stabilitySum += s.stability; // shifts on every grade
    return `${today}|${activeDays().length}|${states.length}|${stabilitySum}|${dueCount()}`;
  } catch {
    return SERVER_SNAPSHOT;
  }
}

interface Ledger {
  mastery: number;
  reinforcedThisWeek: number;
  streakWeeks: number;
  longestWeeks: number;
  freezeHolding: boolean;
  freezesTotal: number;
  due: number;
  sectionsDone: number;
  sectionsTotal: number;
  activeThisWeek: number;
  activeInWindow: number;
  totalActiveDays: number;
  cardCount: number;
  cells: ContributionCell[];
}

function readLedger(today: number): Ledger {
  const states = getAllCardStates();
  // Drop any future-dated day flag (a fast-clock device) before it reaches the
  // streak / graph math — the qc:log:day family has no clock-skew quarantine of
  // its own, unlike qc:card. A day cannot be "active" before it happens.
  const days = activeDays().filter((d) => d <= today);
  const sections = getSections();
  const mastery = masteryCount(states);
  const earned = freezesEarned(mastery);
  const s = streak(days, today, earned);
  const curWeek = weekOf(today);
  const cells = contributionCells(days, today, WEEKS);
  return {
    mastery,
    reinforcedThisWeek: masteredThisWeek(states, today),
    streakWeeks: s.currentWeeks,
    longestWeeks: s.longestWeeks,
    freezeHolding: s.freezesUsed > 0,
    freezesTotal: earned,
    due: dueCount(),
    sectionsDone: completedCount(sections.map((sec) => sec.slug)),
    sectionsTotal: sections.length,
    activeThisWeek: days.filter((d) => weekOf(d) === curWeek).length,
    // In-window count for the "of the last 182 days" copy (the all-time
    // totalActiveDays would print a numerator larger than 182 for a veteran).
    activeInWindow: cells.filter((c) => c.active).length,
    totalActiveDays: days.length,
    cardCount: states.length,
    cells,
  };
}

export function RunbookDashboard() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  // `today` is read from the snapshot (computed in the store edge), so render
  // stays pure. The server / first paint gets SERVER_SNAPSHOT and the inert
  // shell; a returning learner re-renders to the full ledger after hydration.
  const ledger = useMemo(() => {
    if (snap === SERVER_SNAPSHOT) return null;
    const today = Number(snap.split("|")[0]) || 0;
    return readLedger(today);
  }, [snap]);

  const hasData =
    ledger !== null &&
    (ledger.totalActiveDays > 0 || ledger.cardCount > 0 || ledger.sectionsDone > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16">
      <header className="mb-10">
        <p className="text-sm font-mono font-medium tracking-[0.2em] uppercase text-accent-dark dark:text-accent-light mb-3">
          Mastery
        </p>
        <h1 className="font-display text-display-xl tracking-tight text-(--ink)">
          Runbook
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-(--mut)">
          The record of what you have actually made durable — skills carried into
          proven, spaced-repetition-verified retention, and the weeks you kept them there.
        </p>
      </header>

      {hasData ? <Ledger data={ledger!} /> : <EmptyShell />}
    </div>
  );
}

/** Server/first-paint and no-data state — a single inert, today-independent card. */
function EmptyShell() {
  return (
    <div className="rounded-card glass px-6 py-10 text-center shadow-(--shadow-resting)">
      <p className="font-display text-display-md tracking-tight text-(--ink)">
        Your Runbook is empty — for now.
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-(--mut)">
        Grade your first Rep on a lesson and it lands here. Every day you practice
        marks the graph; every skill you keep sharp raises the count above it.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/learn/00-prereqs"
          className="inline-flex items-center rounded-control surface-accent px-4 py-2 text-sm font-medium interactive focus-ring"
        >
          Start a lesson
        </Link>
        <Link
          href="/review"
          className="inline-flex items-center rounded-control border border-(--bd) px-4 py-2 text-sm font-medium text-(--mut) interactive focus-ring"
        >
          Go to review
        </Link>
      </div>
    </div>
  );
}

function Ledger({ data }: { data: Ledger }) {
  const hasActivity = data.totalActiveDays > 0;
  return (
    <div className="animate-fade-up">
      {/* North-Star headline: the number this whole platform steers on. */}
      <section
        aria-label="Skills in proven retention"
        className="rounded-card glass px-6 py-7 shadow-(--shadow-resting) sm:px-8"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-caption">
              Skills in proven retention
            </p>
            <p className="mt-1 flex items-baseline gap-3">
              <span className="font-display text-display-2xl leading-none tracking-tight text-(--ink) tabular-nums">
                {data.mastery}
              </span>
              {data.reinforcedThisWeek > 0 && (
                <span className="text-sm font-medium text-accent-dark dark:text-accent-light">
                  {data.reinforcedThisWeek} kept sharp this week
                </span>
              )}
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-caption">
              Cards whose spacing interval has grown past {RETENTION_STABILITY} days —
              knowledge that has survived being nearly forgotten and come back.
            </p>
          </div>

          <StreakBadge
            weeks={data.streakWeeks}
            freezeHolding={data.freezeHolding}
            freezesTotal={data.freezesTotal}
          />
        </div>
      </section>

      {/* A hairline-separated instrument strip — Linear/GitHub register. */}
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-(--bd) bg-(--bd) shadow-(--shadow-resting) sm:grid-cols-4">
        <Stat label="Longest streak" value={data.longestWeeks} unit={data.longestWeeks === 1 ? "week" : "weeks"} />
        <Stat
          label="Active this week"
          value={data.activeThisWeek}
          unit={data.activeThisWeek === 1 ? "day" : "days"}
        />
        <Stat
          label="Modules complete"
          value={data.sectionsDone}
          unit={`of ${data.sectionsTotal}`}
        />
        <Stat
          label="Due to review"
          value={data.due}
          unit={data.due === 1 ? "card" : "cards"}
          href={data.due > 0 ? "/review" : undefined}
        />
      </dl>

      {/* The contribution graph — the visual record of showing up. */}
      <section
        aria-label={`Activity over the last ${WEEKS} weeks`}
        className="mt-4 rounded-card glass px-5 py-6 shadow-(--shadow-resting) sm:px-6"
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-widest text-caption">
            Last {WEEKS} weeks
          </h2>
          <p className="text-xs tabular-nums text-caption">
            {hasActivity
              ? `active ${data.activeInWindow} of the last ${WEEKS * 7} days`
              : "no activity yet"}
          </p>
        </div>
        <ContributionGraph cells={data.cells} weeks={WEEKS} totalActive={data.activeInWindow} />
      </section>
    </div>
  );
}

function StreakBadge({
  weeks,
  freezeHolding,
  freezesTotal,
}: {
  weeks: number;
  freezeHolding: boolean;
  freezesTotal: number;
}) {
  return (
    <div className="rounded-control border border-accent/25 bg-accent/[0.06] px-4 py-3 dark:bg-accent/10">
      <p className="text-[0.68rem] font-medium uppercase tracking-widest text-accent-dark/80 dark:text-accent-light/80">
        Week streak
      </p>
      <p className="mt-0.5 font-display text-display-md leading-none tracking-tight text-accent-dark tabular-nums dark:text-accent-light">
        {weeks}
        <span className="ml-1 align-baseline text-sm font-sans">{weeks === 1 ? "week" : "weeks"}</span>
      </p>
      <p className="mt-1.5 text-[0.7rem] leading-tight text-caption">
        {freezeHolding
          ? "a freeze is holding a missed week"
          : freezesTotal > 0
            ? `${freezesTotal} freeze${freezesTotal === 1 ? "" : "s"} earned, in reserve`
            : "earn a freeze every 10 skills retained"}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  href,
}: {
  label: string;
  value: number;
  unit: string;
  href?: string;
}) {
  const body = (
    <div className="h-full bg-(--surface-1) px-4 py-4 transition-colors group-hover:bg-(--surface-2)">
      <dt className="text-[0.68rem] font-medium uppercase tracking-widest text-caption">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-display-md leading-none tracking-tight text-(--ink) tabular-nums">
          {value}
        </span>
        <span className="text-xs text-caption">{unit}</span>
      </dd>
    </div>
  );
  return href ? (
    <Link href={href} className="group block focus-ring">
      {body}
    </Link>
  ) : (
    <div className="group">{body}</div>
  );
}

/**
 * GitHub-style grid: WEEKS columns (oldest → current) × 7 weekday rows. The grid
 * is a single role="img" with a full text alternative — 182 focusable cells
 * would be screen-reader noise; each cell carries a native title for sighted
 * hover. Wrapped in overflow-x-auto so a narrow viewport scrolls rather than
 * squashing the squares.
 */
function ContributionGraph({
  cells,
  weeks,
  totalActive,
}: {
  cells: ContributionCell[];
  weeks: number;
  totalActive: number;
}) {
  const columns = useMemo(() => {
    const cols: ContributionCell[][] = Array.from({ length: weeks }, () => []);
    for (const c of cells) cols[c.weekCol].push(c);
    for (const col of cols) col.sort((a, b) => a.weekday - b.weekday);
    return cols;
  }, [cells, weeks]);

  // Month label above the first column whose Monday opens a new month. Each
  // column's [0] cell is its Monday (rows are sorted by weekday).
  const monthLabels = useMemo(() => {
    const labels: (string | null)[] = [];
    let prev = -1;
    for (let w = 0; w < weeks; w++) {
      const d = new Date(columns[w][0].epochDay * 86_400_000);
      const m = d.getUTCMonth();
      labels.push(m !== prev ? d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) : null);
      prev = m;
    }
    return labels;
  }, [columns, weeks]);

  const WEEKDAY = ["Mon", "", "Wed", "", "Fri", "", ""];

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid grid-cols-[auto_1fr] gap-x-2">
        {/* weekday rail — same row as the cells, so its 7 labels align 1:1 */}
        <div className="col-start-1 row-start-2 grid grid-rows-7 gap-[3px] pr-1 text-[0.6rem] leading-[11px] text-caption">
          {WEEKDAY.map((d, i) => (
            <span key={i} className="h-[11px]">
              {d}
            </span>
          ))}
        </div>

        {/* month labels */}
        <div
          className="col-start-2 row-start-1 flex text-[0.6rem] text-caption"
          aria-hidden="true"
        >
          {monthLabels.map((m, i) => (
            <span key={i} className="w-[14px] shrink-0 overflow-visible whitespace-nowrap">
              {m}
            </span>
          ))}
        </div>

        {/* the cells */}
        <div
          role="img"
          aria-label={`Activity heatmap for the last ${weeks} weeks: active on ${totalActive} of ${weeks * 7} days.`}
          className="col-start-2 row-start-2 flex gap-[3px]"
        >
          {columns.map((col, w) => (
            <div key={w} className="grid grid-rows-7 gap-[3px]">
              {col.map((cell) => (
                <Cell key={cell.epochDay} cell={cell} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* legend */}
      <div className="mt-3 flex items-center gap-1.5 text-[0.6rem] text-caption">
        <span>Inactive</span>
        <span className="h-[11px] w-[11px] rounded-[2px] bg-gray-200/80 dark:bg-white/[0.05]" />
        <span className="h-[11px] w-[11px] rounded-[2px] bg-accent-dark dark:bg-accent" />
        <span>Active</span>
      </div>

      {/* Keyboard/touch/screen-reader equivalent of the mouse-only cell tooltips:
          the <summary> is focusable and the list is exposed to AT. */}
      <ActiveDayList cells={cells} />
    </div>
  );
}

function ActiveDayList({ cells }: { cells: ContributionCell[] }) {
  const active = cells.filter((c) => c.active && !c.future);
  if (active.length === 0) return null;
  return (
    <details className="mt-3 text-xs text-caption">
      <summary className="inline-flex cursor-pointer rounded-control px-1 py-0.5 focus-ring">
        View active days
      </summary>
      <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
        {active.map((c) => (
          <li key={c.epochDay} className="tabular-nums">
            {new Date(c.epochDay * 86_400_000).toLocaleDateString("en-US", {
              timeZone: "UTC",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Cell({ cell }: { cell: ContributionCell }) {
  const date = new Date(cell.epochDay * 86_400_000).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const base = "h-[11px] w-[11px] rounded-[2px]";
  if (cell.future) {
    return <span aria-hidden="true" className={`${base} bg-transparent`} />;
  }
  // Light-mode active fill uses accent-dark so active/inactive clears WCAG 1.4.11
  // non-text contrast (~5:1 vs the card, ~4.3:1 vs the inactive gray); dark mode
  // keeps the brighter accent (already ~8:1).
  const cls = cell.active
    ? "bg-accent-dark dark:bg-accent shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
    : "bg-gray-200/80 dark:bg-white/[0.05]";
  return (
    <span
      aria-hidden="true"
      title={`${date}: ${cell.active ? "active" : "no activity"}`}
      className={`${base} ${cls}`}
    />
  );
}
