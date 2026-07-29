// Sync health — a tiny external store (getSnapshot/subscribe, the same shape
// review-store exposes) so the UI can say, quietly, that background sync has
// stopped working. Without it a permanently failing sync (expired session,
// server down) is invisible: progress silently stops crossing devices.
//
//   ok       — no signal; the last attempt succeeded (or none has run yet)
//   degraded — repeated network/server failures; retries continue
//   auth     — the session is unusable; only signing in again can fix it
//   mismatch — this device is bound to a DIFFERENT account; sync is blocked
//              until the adopt-vs-reset choice is made
//
// One transient failure on a flaky network is normal and shows nothing; the
// degraded signal appears only after DEGRADED_AFTER consecutive failures.
// Any successful sync resets to ok.
//
// This lives apart from sync-client.ts ON PURPOSE. sync-client imports
// aws-amplify and must only ever be loaded dynamically (see its header), but the
// health signal has to be readable from the global nav — which every page
// renders. Keeping the store dependency-free lets those surfaces subscribe
// without dragging the Amplify graph into every bundle.

export type SyncHealth = "ok" | "degraded" | "auth" | "mismatch";

let health: SyncHealth = "ok";
const listeners = new Set<() => void>();

export function setSyncHealth(next: SyncHealth): void {
  if (health === next) return;
  health = next;
  for (const listener of [...listeners]) listener();
}

export function getSyncHealth(): SyncHealth {
  return health;
}

export function subscribeSyncHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * True when this device's stored progress belongs to a different account than
 * the one signed in — so the local qc:* data on screen is somebody else's and
 * must not be presented as this account's.
 */
export function progressIsForeign(): boolean {
  return health === "mismatch";
}
