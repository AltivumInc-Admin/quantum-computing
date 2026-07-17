"use client";

import { useMemo, useSyncExternalStore } from "react";
import { subscribe, getAllCardStates, dueCount } from "@/lib/review-store";
import { activeDays } from "@/lib/activity-log";
import { completedCount } from "@/lib/progress-store";
import { getAllMeasurements } from "@/lib/skill-measure";
import { getSections } from "@/lib/sections";
import { epochDay } from "@/lib/review-schedule";
import { readWorkspace, type WorkspaceModel } from "@/lib/workspace";

/**
 * The ONE external-store snapshot for /workspace, modelled exactly on
 * runbook-dashboard.tsx. The static export prerenders the inert shell (the sentinel
 * below) and the real model hydrates from localStorage after mount; every local zone
 * reads this single memo instead of scanning storage itself on every qc-progress
 * event. Date.now() lives here, in the sanctioned store edge, so render stays pure.
 */

// Its leading "0" epoch-day marks "no data yet" — a real client snapshot always
// carries today's non-zero epoch-day.
export const SERVER_SNAPSHOT = "0|0|0|0|0|0|0|0";

function snapshot(): string {
  try {
    const today = epochDay(Date.now());
    const states = getAllCardStates();
    let stabilitySum = 0;
    for (const s of states) stabilitySum += s.stability; // shifts on every grade
    // `done` is load-bearing beyond stabilitySum/activeDays: completing a section on a
    // day already logged active changes NEITHER, yet must re-render Z4 and the Valve.
    const done = completedCount(getSections().map((s) => s.slug));
    // The qc:measure store feeds Z-Records: a NEW personal best changes the count,
    // an IMPROVED one changes only the gates sum — both must invalidate the snapshot
    // or Records shows stale bests until an unrelated store happens to change.
    const measurements = getAllMeasurements();
    let gatesSum = 0;
    for (const m of measurements) gatesSum += m.gates;
    return `${today}|${activeDays().length}|${states.length}|${stabilitySum}|${dueCount()}|${done}|${measurements.length}|${gatesSum}`;
  } catch {
    return SERVER_SNAPSHOT;
  }
}

/** The full workspace model, or null on the server / first paint (the inert shell). */
export function useWorkspace(): WorkspaceModel | null {
  const snap = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  return useMemo(() => {
    if (snap === SERVER_SNAPSHOT) return null;
    const today = Number(snap.split("|")[0]) || 0;
    return readWorkspace(today);
  }, [snap]);
}
