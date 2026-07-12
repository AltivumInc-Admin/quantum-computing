"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Invisible background sync driver, mounted once in the root layout inside
 * AuthProvider. When the learner is signed in AND the sync backend is
 * configured, it syncs on arrival, debounces a sync behind every "qc-progress"
 * burst (grading a card, completing a section), and flushes any unsynced
 * progress when the page is dismissed — a review session graded at a
 * 10-20s/card cadence must not be able to leave the tab with the whole
 * session's grades still local-only.
 *
 * The sync client (and with it aws-amplify) is imported DYNAMICALLY inside the
 * effect: the shared bundle stays Amplify-free (the auth provider's ssr:false
 * contract), and by the time status is "authenticated" the bridge has already
 * run Amplify.configure, which fetchAuthSession requires.
 */

/** Trailing debounce: a sync fires after this much qc-progress quiet. */
const DEBOUNCE_MS = 20_000;
/**
 * maxWait anchor: steady grading (each event resets the trailing timer) would
 * starve the debounce forever, so a sync fires at most this long after the
 * FIRST unsynced event regardless of continuing activity.
 */
const MAX_WAIT_MS = 60_000;

type SyncClient = typeof import("@/lib/sync-client");

export function ProgressSync() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!process.env.NEXT_PUBLIC_SYNC_URL) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;
    // Unsynced qc-progress activity since the last sync attempt.
    let pending = false;
    // Kept once loaded so the exit flush can run SYNCHRONOUSLY — a dynamic
    // import's .then may never execute during page dismissal.
    let client: SyncClient | null = null;

    const load = () =>
      import("@/lib/sync-client").then((mod) => {
        client = mod;
        return mod;
      });

    const run = () => {
      void load().then(({ syncNow, isSyncConfigured }) => {
        if (disposed || !isSyncConfigured()) return;
        syncNow().catch((e: Error) => {
          // A different account synced this device before: never auto-resolve —
          // the workspace SyncPanel owns the explicit adopt-vs-reset choice.
          if (e?.name === "SyncAccountMismatch") return;
          console.warn("progress sync failed:", e);
        });
      });
    };
    const clearTimers = () => {
      if (timer) clearTimeout(timer);
      if (maxTimer) clearTimeout(maxTimer);
      timer = null;
      maxTimer = null;
    };
    const fire = () => {
      clearTimers();
      pending = false;
      run();
    };
    const debounced = () => {
      pending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, DEBOUNCE_MS);
      // Anchored to the first pending event — deliberately never reset here.
      if (!maxTimer) maxTimer = setTimeout(fire, MAX_WAIT_MS);
    };
    // exitFlush is best-effort and synchronous to initiate (cached auth
    // header, keepalive fetch, no pull). When it cannot run (this page load
    // never completed a sync), the timers stay armed in case the page
    // survives — visibility "hidden" is often just a tab switch.
    const flushOnExit = () => {
      if (!pending || !client || !client.isSyncConfigured()) return;
      if (client.exitFlush()) {
        clearTimers();
        pending = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushOnExit();
    };

    run(); // initial pull-merge on sign-in / arrival (also warms `client`)
    window.addEventListener("qc-progress", debounced);
    window.addEventListener("pagehide", flushOnExit);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      clearTimers();
      window.removeEventListener("qc-progress", debounced);
      window.removeEventListener("pagehide", flushOnExit);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [status]);

  return null;
}
