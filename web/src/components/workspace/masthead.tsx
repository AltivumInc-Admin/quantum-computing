"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale } from "@/i18n";
import {
  isSyncConfigured,
  subscribeSyncHealth,
  getSyncHealth,
  type SyncHealth,
} from "@/lib/sync-client";

/**
 * Z0 — the masthead: h1 "{t("workspaceUi.title")}", the account email, and a right-aligned sync
 * readout. A terminal shows the timestamp, not "3m ago", so the readout is a status
 * dot + an exact <time>. The h1 lives here so EVERY page state (authenticated,
 * unconfigured, loading) carries the page's one heading — fixing the pre-existing bug
 * where the title rendered as a <p> and the page had no heading outline at all.
 */
export function Masthead({ email }: { email: string | null }) {
  const { t } = useLocale();
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="font-display text-display-lg tracking-tight text-(--ink)">
          {t("workspaceUi.title")}
        </h1>
        {email && <p className="mt-1 text-sm text-caption">{email}</p>}
      </div>
      <SyncReadout />
    </header>
  );
}

type SyncState = "idle" | "syncing" | "error";

/**
 * The sync affordance. The sync client — and with it aws-amplify — is imported
 * dynamically on demand, preserving the auth layer's code-split contract (mirrors the
 * former SyncPanel). Without NEXT_PUBLIC_SYNC_URL it states the device-local truth,
 * honestly, with no future-tense marketing.
 */
const OK_HEALTH: SyncHealth = "ok";

function SyncReadout() {
  const { t } = useLocale();
  const configured = isSyncConfigured();
  const [state, setState] = useState<SyncState>("idle");
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  // Background sync health (sync-client's external store). "ok" renders exactly
  // what always rendered; the degraded/auth lines replace the timestamp INSIDE
  // the persistent role="status" span, so the change is announced reliably.
  const health = useSyncExternalStore(subscribeSyncHealth, getSyncHealth, () => OK_HEALTH);

  useEffect(() => {
    if (!configured) return;
    let disposed = false;
    const read = () => {
      void import("@/lib/sync-client").then(({ lastSyncedAt }) => {
        if (!disposed) setLastSynced(lastSyncedAt());
      });
    };
    read();
    window.addEventListener("qc-sync", read);
    return () => {
      disposed = true;
      window.removeEventListener("qc-sync", read);
    };
  }, [configured]);

  const handleSync = () => {
    setState("syncing");
    void import("@/lib/sync-client")
      .then(({ syncNow }) => syncNow())
      .then(() => setState("idle"))
      .catch(() => setState("error"));
  };

  if (!configured) {
    return (
      <p className="text-sm text-caption">{t("workspaceUi.localOnly")}</p>
    );
  }


  const iso = lastSynced ? new Date(lastSynced).toISOString() : undefined;
  const clock = lastSynced
    ? new Date(lastSynced).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;

  const attention = state === "error" || health !== "ok";
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full animate-signal ${
          attention ? "bg-warm-dark dark:bg-warm-light" : "bg-accent-dark dark:bg-accent"
        }`}
      />
      <span role="status" className="text-(--mut) tabular-nums">
        {state === "syncing" ? (
          "Syncing…"
        ) : health === "auth" ? (
          "Session expired — sign in to resume sync"
        ) : health === "degraded" ? (
          "Sync paused — retrying"
        ) : state === "error" ? (
          t("workspaceUi.syncFailed")
        ) : clock ? (
          <>
            Synced <time dateTime={iso}>{clock}</time>
          </>
        ) : (
          t("workspaceUi.notYetSynced")
        )}
      </span>
      <button
        type="button"
        onClick={() => handleSync()}
        disabled={state === "syncing"}
        className="text-sm font-medium text-accent-dark dark:text-accent-light interactive focus-ring rounded-control disabled:opacity-60"
      >
        Sync now
      </button>
    </div>
  );
}
