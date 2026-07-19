"use client";

import { useSyncExternalStore } from "react";
import type { CardKind } from "@/lib/review-store";
import { PROGRESS_EVENT_NAME, subscribe } from "@/lib/progress-store";

/**
 * The ONE persistent solved-flag pattern shared by all six graded Rep widgets,
 * lifted verbatim from challenge.tsx (debug-circuit carried a copy). Each Rep's
 * solved-once-ever state is a set-once "1" flag under `qc:<kind>:<id>`, where
 * <kind> is the same vocabulary as CardKind — so a surface counting "solved"
 * (and the sync snapshot) sees one uniform shape across every Rep kind, and the
 * flags ride the additive union branch of progress-merge like qc:section:*.
 *
 * Semantics, preserved exactly:
 *  - useSyncExternalStore keeps the read hydration-safe (server snapshot false,
 *    the client re-reads localStorage after mount), subscribed through the
 *    store's own subscribe() — BOTH channel legs, the in-tab qc-progress event
 *    and the qc:*-filtered cross-tab "storage" event, so a Rep solved in one
 *    tab renders solved in a second open tab exactly like the sidebar counts;
 *  - writes are set-once and dispatch the same "qc-progress" event every other
 *    progress write uses (recordActivity is NOT called here — the solve's
 *    gradeCard write already logs the active day and rides its own dispatch);
 *  - persist=false (the /e2e-fixtures contract) writes NOTHING, so no visitor
 *    ever mints phantom qc:* keys that the additive cross-device sync would
 *    then replicate to every device forever.
 */

/** localStorage key for a Rep's set-once solved flag: `qc:<kind>:<id>`. */
export function solvedFlagKey(kind: CardKind, id: string): string {
  return `qc:${kind}:${id}`;
}

export function usePersistentSolved(
  kind: CardKind,
  id: string,
  persist = true,
): [boolean, () => void] {
  const key = solvedFlagKey(kind, id);
  const solved = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const mark = () => {
    if (!persist) return;
    try {
      localStorage.setItem(key, "1");
      window.dispatchEvent(new Event(PROGRESS_EVENT_NAME));
    } catch {
      /* storage unavailable — grading still works, just not remembered */
    }
  };
  return [solved, mark];
}
