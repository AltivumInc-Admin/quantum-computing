"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { subscribe, getAllCardStates } from "@/lib/review-store";
import { activeDays } from "@/lib/activity-log";
import { isSectionComplete } from "@/lib/progress-store";
import { getSections } from "@/lib/sections";
import { epochDay } from "@/lib/review-schedule";
import { masteryCount, streak, freezesEarned } from "@/lib/runbook";
import { isQpuConfigured, getBudget } from "@/lib/qpu-client";
import {
  computeCredentials,
  type Credential,
  type CredentialGroup,
} from "@/lib/credentials";

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

// One enamel hue per group — the wall reads as a collection of distinct medal
// types (an oklch hue angle; earned seals only, locked stay neutral).
const GROUP_HUE: Record<CredentialGroup, number> = {
  completion: 192, // teal — the platform accent
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
  hardware: "Circuits run on a real quantum computer.",
};

function snapshot(): string {
  try {
    const today = epochDay(Date.now());
    const states = getAllCardStates();
    let stabilitySum = 0;
    for (const s of states) stabilitySum += s.stability;
    const done = getSections().reduce((n, s) => (isSectionComplete(s.slug) ? n + 1 : n), 0);
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

function readCredentials(today: number, hardwareRuns: number): { creds: Credential[]; earned: number } {
  const states = getAllCardStates();
  const mastery = masteryCount(states);
  const days = activeDays().filter((d) => d <= today);
  const longestStreakWeeks = streak(days, today, freezesEarned(mastery)).longestWeeks;
  const sections = getSections().map((s) => ({
    slug: s.slug,
    title: s.title,
    done: isSectionComplete(s.slug),
  }));
  const creds = computeCredentials({ sections, mastery, longestStreakWeeks, hardwareRuns });
  return { creds, earned: creds.filter((c) => c.earned).length };
}

export function CredentialsWall() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  // Hardware runs come from the QPU backend (server-reconciled provenance), not
  // the local qc:* snapshot — fetched once, env-gated, and 0 (locked) when the
  // QPU surface is off or the learner is signed out.
  const [hardwareRuns, setHardwareRuns] = useState(0);
  useEffect(() => {
    if (!isQpuConfigured()) return;
    void getBudget()
      .then((b) => setHardwareRuns(b.tasks.filter((t) => t.status === "COMPLETED").length))
      .catch(() => {}); // signed out / unreachable → stays 0 (hardware locked)
  }, []);

  const data = useMemo(() => {
    if (snap === SERVER_SNAPSHOT) return null;
    return readCredentials(Number(snap.split("|")[0]) || 0, hardwareRuns);
  }, [snap, hardwareRuns]);

  const groups: CredentialGroup[] = ["completion", "mastery", "consistency", "hardware"];

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16">
      <header className="mb-10">
        <p className="text-sm font-medium tracking-widest uppercase text-accent dark:text-accent-light mb-3">
          Credentials
        </p>
        <h1 className="font-display text-display-xl tracking-tight text-gray-900 dark:text-white">
          Your credentials
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-gray-400">
          Each medal is earned, not awarded — struck from work you can point to. Mastery
          medals reflect what you hold in retention right now, so they mean exactly what
          they say.
        </p>
        {data && (
          <p className="mt-4 text-sm tabular-nums text-caption">
            <span className="font-semibold text-gray-700 dark:text-gray-200">{data.earned}</span> of{" "}
            {data.creds.length} earned
          </p>
        )}
      </header>

      {data === null ? (
        <div
          aria-hidden="true"
          className="h-40 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) shadow-(--shadow-resting)"
        />
      ) : (
        <div className="animate-fade-up space-y-10">
          {groups.map((g) => {
            const items = data.creds.filter((c) => c.group === g);
            return (
              <section key={g} aria-label={GROUP_TITLE[g]}>
                <div className="mb-4">
                  <h2 className="font-display text-display-md tracking-tight text-gray-900 dark:text-white">
                    {GROUP_TITLE[g]}
                  </h2>
                  <p className="mt-0.5 text-sm text-caption">{GROUP_BLURB[g]}</p>
                </div>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((c) => (
                    <Medal key={c.id} cred={c} hue={GROUP_HUE[g]} />
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

function Medal({ cred, hue }: { cred: Credential; hue: number }) {
  const enamel = `oklch(0.62 0.13 ${hue})`;
  return (
    <li
      className={`flex items-start gap-4 rounded-card border px-4 py-4 shadow-(--shadow-resting) ${
        cred.earned
          ? "border-gray-200/70 bg-(--surface-1) dark:border-white/[0.08]"
          : "border-dashed border-gray-300/70 bg-(--surface-2)/60 dark:border-white/[0.06]"
      }`}
    >
      <Seal earned={cred.earned} enamel={enamel} />
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <span className="truncate">{cred.title}</span>
          <span
            className={`shrink-0 rounded-chip px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide ${
              cred.earned
                ? "bg-accent/12 text-accent-dark dark:text-accent-light"
                : "bg-gray-200/70 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400"
            }`}
          >
            {cred.earned ? "Earned" : "Locked"}
          </span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-caption">
          {cred.earned ? cred.evidence : cred.requirement}
        </p>
      </div>
    </li>
  );
}

/**
 * An engraved medallion: concentric rings struck in the group's enamel when
 * earned, a quiet outline when locked. Purely decorative (the state is also in
 * the "Earned/Locked" text), so aria-hidden.
 */
function Seal({ earned, enamel }: { earned: boolean; enamel: string }) {
  if (!earned) {
    return (
      <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden="true">
        <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeDasharray="3 3" className="text-gray-300 dark:text-gray-600" />
        <circle cx="20" cy="20" r="9" fill="none" stroke="currentColor" strokeWidth="1"
          className="text-gray-300 dark:text-gray-600" />
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

export function CredentialsWorkspaceTeaser() {
  return (
    <Link
      href="/credentials"
      className="mt-4 flex items-center justify-between rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) px-6 py-4 shadow-(--shadow-resting) interactive focus-ring group"
    >
      <span>
        <span className="block text-sm font-medium text-gray-900 dark:text-white">Your credentials</span>
        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
          Engraved medals for what you have made durable.
        </span>
      </span>
      <svg
        className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
