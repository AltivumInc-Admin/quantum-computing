"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { subscribe, getAllCardStates } from "@/lib/review-store";
import { activeDays } from "@/lib/activity-log";
import { completedCount, isSectionComplete } from "@/lib/progress-store";
import { getSections } from "@/lib/sections";
import { epochDay } from "@/lib/review-schedule";
import { masteryCount, streak, freezesEarned } from "@/lib/runbook";
import { isQpuConfigured, getBudget } from "@/lib/qpu-client";
import { useAuth } from "@/components/auth/auth-provider";
import {
  computeCredentials,
  type Credential,
  type CredentialGroup,
} from "@/lib/credentials";
import {
  LADDER_RUNS,
  DEEP_SAMPLE_SHOTS,
  LADDER_MICROS,
  usd,
  tierReachable,
  type HardwareReach,
} from "@/lib/qpu-budget";

/**
 * The Credentials wall: an engraved-medal register of what the learner has
 * verifiably earned. Every medal derives from already-synced progress (module
 * flags, CardState retention, the Runbook's longest streak) — no new store, no
 * server. Mirrors the Runbook's useSyncExternalStore empty-shell hydration so
 * the static export prerenders an inert shell and the wall hydrates client-side.
 * State (earned / locked) is carried by the seal's FORM and an explicit label,
 * never by color alone.
 */

const SERVER_SNAPSHOT = "0|0|0|0|0";

/**
 * A medal has FOUR states, and "Locked" is a claim: it says the medal is still
 * winnable. On the sponsored hardware track that claim can be false — the allowance is
 * finite and a medal can be spent out of reach — and it can also be unknown, when the
 * hardware record fails to load. Collapsing either case into "Locked" is the same
 * dishonesty as advertising a medal the budget cannot buy.
 */
type MedalState = "earned" | "locked" | "out-of-reach" | "unverified";

/** The note an unverified medal points at (aria-describedby), so its explanation
 *  travels with the medal rather than sitting in a group header. */
const HARDWARE_UNVERIFIED_NOTE_ID = "hardware-record-unverified";

// One enamel hue per group — the wall reads as a collection of distinct medal
// types (an oklch hue angle; earned seals only, locked stay neutral).
const GROUP_HUE: Record<CredentialGroup, number> = {
  completion: 118, // olive — the platform accent (globals.css --accent)
  mastery: 158, // green
  consistency: 288, // violet
  hardware: 42, // gold — the run-on-real-hardware prestige
};
const GROUP_TITLE: Record<CredentialGroup, string> = {
  completion: "Completion",
  mastery: "Mastery",
  consistency: "Consistency",
  hardware: "Hardware",
};
const GROUP_BLURB: Record<CredentialGroup, string> = {
  completion: "Modules carried to the end.",
  mastery: "Skills held in proven, spaced-repetition retention.",
  consistency: "Weeks of showing up, unbroken.",
  hardware:
    "Circuits run on a real quantum computer. The platform pays Amazon Braket for every one of these runs.",
};

function snapshot(): string {
  try {
    const today = epochDay(Date.now());
    const states = getAllCardStates();
    let stabilitySum = 0;
    for (const s of states) stabilitySum += s.stability;
    const done = completedCount(getSections().map((s) => s.slug));
    // activeDays().length is load-bearing: the Consistency medals derive from
    // the streak, and the not-due re-practice path logs an active day WITHOUT
    // changing any card state — so without this term the wall would miss a
    // streak that crosses a tier boundary (the Runbook fingerprint carries it
    // for the same reason). `done` also guards a section completed on an
    // already-logged day.
    return `${today}|${activeDays().length}|${states.length}|${stabilitySum}|${done}`;
  } catch {
    return SERVER_SNAPSHOT;
  }
}

function readCredentials(
  today: number,
  hardware: { runs: number; shots: number },
): { creds: Credential[]; earned: number } {
  const states = getAllCardStates();
  const mastery = masteryCount(states);
  const days = activeDays().filter((d) => d <= today);
  const longestStreakWeeks = streak(days, today, freezesEarned(mastery)).longestWeeks;
  const sections = getSections().map((s) => ({
    slug: s.slug,
    title: s.title,
    done: isSectionComplete(s.slug),
  }));
  const creds = computeCredentials({
    sections,
    mastery,
    longestStreakWeeks,
    hardwareRuns: hardware.runs,
    hardwareShots: hardware.shots,
  });
  return { creds, earned: creds.filter((c) => c.earned).length };
}

export function CredentialsWall() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const { status } = useAuth();
  // Hardware runs come from the QPU backend (server-reconciled provenance), not
  // the local qc:* snapshot. The fetch waits for auth to resolve to
  // "authenticated" (status in the dep array, the progress-sync contract): the
  // lazily-loaded Amplify bridge must run Amplify.configure before
  // fetchAuthSession works, so an empty-dep mount fetch raced it, the thrown
  // NotSignedIn was swallowed, and earned Hardware medals rendered "Locked"
  // for the life of the page.
  // Runs AND shots come from the server's monotonic aggregates, NOT from
  // b.tasks.filter(COMPLETED) — that list is truncated to the newest 50 rows, and
  // refunded FAILED/RELEASED rows still occupy slots in it, so a busy learner could
  // push an earned COMPLETED row out of the window and watch a medal un-earn.
  // remainingMicros rides along because a hardware medal's honesty depends on it: a
  // medal the learner's remaining allowance can no longer buy is NOT "Locked" (a word
  // that promises attainability) — it is out of reach, and it must say so. `known`
  // gates that verdict: without a budget we know only that the medal is unearned.
  const [hardware, setHardware] = useState({
    runs: 0,
    shots: 0,
    remainingMicros: 0,
    known: false,
  });
  // Signed out / QPU surface off is an HONEST zero (locked). A failed fetch is
  // not — it becomes an explicit "couldn't verify" note on the Hardware group.
  const [hardwareUnverified, setHardwareUnverified] = useState(false);
  useEffect(() => {
    if (!isQpuConfigured() || status !== "authenticated") return;
    let disposed = false;
    getBudget()
      .then((b) => {
        if (disposed) return;
        // An older Lambda omits the medal counters: the record is UNKNOWN, not zero.
        // Reachability and even "earned" are then unknowable, so this is the SAME state
        // as a failed fetch — never invented zeros that would un-earn a real medal.
        if (b.completedRuns === null || b.completedShots === null) {
          setHardwareUnverified(true);
          return;
        }
        setHardware({
          runs: b.completedRuns,
          shots: b.completedShots,
          remainingMicros: b.remainingMicros,
          known: true,
        });
        setHardwareUnverified(false);
      })
      .catch((e: Error) => {
        // Signed out mid-flight → honest zero, not an error.
        if (disposed || e?.name === "NotSignedIn") return;
        setHardwareUnverified(true);
      });
    return () => {
      disposed = true;
    };
  }, [status]);

  const data = useMemo(() => {
    if (snap === SERVER_SNAPSHOT) return null;
    return readCredentials(Number(snap.split("|")[0]) || 0, hardware);
  }, [snap, hardware]);

  const groups: CredentialGroup[] = ["completion", "mastery", "consistency", "hardware"];

  /**
   * Four states, four words — and every one of them reaches a screen reader, because
   * each is the medal's own chip text, not a caveat parked in a group header that a
   * user navigating by list item never hears.
   *
   *   earned        — struck.
   *   locked        — not yet earned, and still attainable.
   *   out-of-reach  — not earned and NO LONGER ATTAINABLE on the remaining sponsored
   *                   budget. The bug this state exists for: three 100-shot runs cost
   *                   $1.335 of a $2.50 lifetime allowance and cap the learner at 896
   *                   shots, so the 1,000-shot medal is foreclosed forever — and the
   *                   wall went on calling it "Locked", i.e. still winnable.
   *   unverified    — the hardware record could not be fetched, so `earned` is
   *                   UNKNOWN, not false. Rendering an earned medal as "Locked" here
   *                   was a lie told only to the screen-reader user, since the sighted
   *                   caveat lived in the group header.
   */
  const medalState = (c: Credential): MedalState => {
    if (c.group !== "hardware") return c.earned ? "earned" : "locked";
    if (hardwareUnverified) return "unverified";
    if (c.earned) return "earned";
    const [, metric, n] = c.id.split(":");
    const tier = { metric: metric as "runs" | "shots", n: Number(n) };
    const reach: HardwareReach = {
      completedRuns: hardware.runs,
      completedShots: hardware.shots,
      remainingMicros: hardware.remainingMicros,
    };
    // Without a budget (signed out, QPU surface off, fetch in flight) reachability is
    // unknowable — and an unknown must never be reported as a foreclosure.
    if (!hardware.known || tierReachable(tier, reach)) return "locked";
    return "out-of-reach";
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16">
      <header className="mb-10">
        <p className="font-mono text-sm font-medium tracking-[0.2em] uppercase text-accent dark:text-accent-light mb-3">
          Credentials
        </p>
        <h1 className="font-display text-display-xl tracking-tight text-(--ink)">
          Your credentials
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-(--mut)">
          Each medal is earned, not awarded — struck from work you can point to. Mastery
          medals reflect what you hold in retention right now, so they mean exactly what
          they say.
        </p>
        {data && (
          <p className="mt-4 text-sm tabular-nums text-caption">
            <span className="font-semibold text-(--mut)">{data.earned}</span> of{" "}
            {data.creds.length} earned
          </p>
        )}
      </header>

      {data === null ? (
        <div
          aria-hidden="true"
          className="h-40 rounded-card border border-(--bd) bg-(--surface-1) shadow-(--shadow-resting)"
        />
      ) : (
        <div className="animate-fade-up space-y-10">
          {groups.map((g) => {
            const items = data.creds.filter((c) => c.group === g);
            return (
              <section key={g} aria-label={GROUP_TITLE[g]}>
                <div className="mb-4">
                  <h2 className="font-display text-display-md tracking-tight text-(--ink)">
                    {GROUP_TITLE[g]}
                  </h2>
                  <p className="mt-0.5 text-sm text-caption">{GROUP_BLURB[g]}</p>
                  {/* The lab record: the artifact a peer would actually be shown. */}
                  {g === "hardware" && hardware.runs > 0 && (
                    <p className="mt-1 text-sm tabular-nums text-(--mut)">
                      Your record:{" "}
                      <span className="font-medium">
                        {hardware.runs.toLocaleString("en-US")} completed run
                        {hardware.runs === 1 ? "" : "s"}
                      </span>
                      , <span className="font-medium">{hardware.shots.toLocaleString("en-US")} shots</span>{" "}
                      on IQM Garnet.
                    </p>
                  )}
                  {/* The route out of a dead end. The hardware group listed three
                      requirements and named no surface that grants them, and never said
                      the money behind them is finite. Both facts are derived: the plan
                      from HARDWARE_TIERS + PRICING, the link from the one page that
                      hosts the submit panel. */}
                  {g === "hardware" && (
                    <p className="mt-1 text-sm leading-relaxed text-caption">
                      All three fit inside the sponsored allowance:{" "}
                      <span className="tabular-nums text-(--mut)">
                        {LADDER_RUNS} runs totalling {DEEP_SAMPLE_SHOTS.toLocaleString("en-US")}{" "}
                        shots — {usd(LADDER_MICROS)}
                      </span>
                      . The allowance is one-time and does not refill, so how you spend it decides
                      which of these you can still earn.{" "}
                      <Link
                        href="/workspace"
                        className="font-medium text-accent-dark dark:text-accent-light underline underline-offset-2 interactive focus-ring rounded-control"
                      >
                        Run on IQM Garnet
                      </Link>
                    </p>
                  )}
                  {g === "hardware" && hardwareUnverified && (
                    <p
                      id={HARDWARE_UNVERIFIED_NOTE_ID}
                      role="status"
                      className="mt-1 text-xs text-warm-dark dark:text-warm-light"
                    >
                      Couldn&apos;t verify your hardware record — these medals show as unverified,
                      not locked. Reload to retry.
                    </p>
                  )}
                </div>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((c) => (
                    <Medal key={c.id} cred={c} hue={GROUP_HUE[g]} state={medalState(c)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Medal({ cred, hue, state }: { cred: Credential; hue: number; state: MedalState }) {
  const enamel = `oklch(0.62 0.13 ${hue})`;
  // State is carried by the chip's WORD (and the seal's form), never by colour — the
  // four states have to be four different things to hear, not four different things to
  // see. The out-of-reach and unverified tones are the semantic warm pair, but they
  // are redundant with the label by construction.
  const chip = {
    earned: "Earned",
    locked: "Locked",
    "out-of-reach": "Out of reach",
    unverified: "Unverified",
  }[state];
  const chipTone = {
    earned: "bg-accent/12 text-accent-dark dark:text-accent-light",
    locked: "bg-(--field) text-(--mut)",
    "out-of-reach": "bg-warm/12 text-warm-dark dark:text-warm-light",
    unverified: "bg-warm/12 text-warm-dark dark:text-warm-light",
  }[state];
  const detail = {
    earned: cred.evidence,
    locked: cred.requirement,
    "out-of-reach": `${cred.requirement} — out of reach on your remaining sponsored budget.`,
    unverified: cred.requirement,
  }[state];
  return (
    <li
      className={`flex items-start gap-4 rounded-card border px-4 py-4 shadow-(--shadow-resting) ${
        state === "earned"
          ? "border-(--bd) bg-(--surface-1)"
          : "border-dashed border-(--bd) bg-(--surface-2)/60"
      }`}
    >
      <Seal state={state} enamel={enamel} />
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-(--ink)">
          <span className="truncate">{cred.title}</span>
          <span
            className={`shrink-0 rounded-chip px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide ${chipTone}`}
          >
            {chip}
          </span>
        </p>
        <p
          className="mt-1 text-xs leading-relaxed text-caption"
          // The unverified medal points at the note that explains WHY its state is
          // unknown, so the explanation travels with the medal instead of living in a
          // group header a list-item reader never visits.
          aria-describedby={state === "unverified" ? HARDWARE_UNVERIFIED_NOTE_ID : undefined}
        >
          {detail}
        </p>
      </div>
    </li>
  );
}

/**
 * An engraved medallion: concentric rings struck in the group's enamel when earned, a
 * quiet dashed outline when locked, and a struck-through outline when the medal is out
 * of reach — three different FORMS, not three colours. Purely decorative (every state
 * is also in the chip's text), so aria-hidden throughout.
 */
function Seal({ state, enamel }: { state: MedalState; enamel: string }) {
  if (state !== "earned") {
    return (
      <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden="true">
        <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeDasharray="3 3" className="text-gray-300 dark:text-gray-600" />
        <circle cx="20" cy="20" r="9" fill="none" stroke="currentColor" strokeWidth="1"
          className="text-gray-300 dark:text-gray-600" />
        {state === "out-of-reach" && (
          // Struck through: a FORM the locked seal does not have, on the AA-passing
          // muted pair (the contrast guard rejects gray-400/dark:gray-500 outright).
          <path d="M9 31L31 9" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" className="text-gray-500 dark:text-gray-400" />
        )}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden="true">
      {/* rim-lit engraved seal */}
      <circle cx="20" cy="20" r="18" fill={enamel} opacity="0.14" />
      <circle cx="20" cy="20" r="16" fill={enamel} opacity="0.9" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="1" />
      <path
        d="M14.5 20.5l3.6 3.6 7.4-7.8"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

