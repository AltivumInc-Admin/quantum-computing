"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Invisible background sync driver, mounted once in the root layout inside
 * AuthProvider. When the learner is signed in AND the sync backend is
 * configured, it syncs on arrival and then debounces a sync behind every
 * "qc-progress" burst (grading a card, completing a section), so lesson work
 * reaches the server without a workspace visit.
 *
 * The sync client (and with it aws-amplify) is imported DYNAMICALLY inside the
 * effect: the shared bundle stays Amplify-free (the auth provider's ssr:false
 * contract), and by the time status is "authenticated" the bridge has already
 * run Amplify.configure, which fetchAuthSession requires.
 */

const DEBOUNCE_MS = 20_000;

export function ProgressSync() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!process.env.NEXT_PUBLIC_SYNC_URL) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      void import("@/lib/sync-client").then(({ syncNow, isSyncConfigured }) => {
        if (disposed || !isSyncConfigured()) return;
        syncNow().catch((e) => console.warn("progress sync failed:", e));
      });
    };
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, DEBOUNCE_MS);
    };

    run(); // initial pull-merge on sign-in / arrival
    window.addEventListener("qc-progress", debounced);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("qc-progress", debounced);
    };
  }, [status]);

  return null;
}
