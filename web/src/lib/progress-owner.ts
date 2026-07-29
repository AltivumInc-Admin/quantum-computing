// Per-owner namespacing for local learner data.
//
// Progress used to live in flat localStorage keys ("qc:card:x"), which have no
// owner dimension. On a shared browser that meant the next account to sign in
// saw — and could adopt — the previous person's cards, streak, saved circuits
// and personal bests. Gating the readers only patched the symptom; this removes
// the class: every owner gets their own bucket and can only ever see their own.
//
// THREE KEY SPACES, and the distinction is load-bearing:
//
//   canonical  "qc:card:x"          — what the SERVER stores. Never changes.
//   local      "qc:o:<owner>:card:x" — what this device stores, per owner.
//   device     "qc:locale"           — genuinely device-wide, never scoped.
//
// The canonical space is frozen because two server-side consumers already read
// it: the sync Lambda's stored snapshots (three live rows) and
// lambda/review-email/review-email-core.mjs, which scans them for "qc:card:".
// Translation therefore happens at the wire boundary only — see progress-merge.
//
// Device-global keys are exempt in BOTH directions. qc:locale is the case that
// proves it: app/layout.tsx emits a pre-hydration inline script that reads the
// bare literal "qc:locale" before any module graph exists, so no owner is
// knowable there — and it already appears inside the live server rows, so apply
// receives it on the first sync of every existing user.

import { PROGRESS_EVENT_NAME } from "./progress-event";

const OWNER_KEY = "qc-owner:active"; // outside qc:* so it is never synced
const SCOPE_PREFIX = "qc:o:";
const CANONICAL_PREFIX = "qc:";

export const ANON_OWNER = "anon";

/** Keys that describe the DEVICE, not the learner. Never owner-scoped. */
const DEVICE_GLOBAL = new Set(["qc:locale"]);

/**
 * Device-global keys that are STILL carried in the synced snapshot. qc:locale
 * already sits inside the three live server rows, so dropping it from the
 * export would silently stop the language preference syncing across a user's
 * devices — a behaviour change this refactor has no business making.
 */
export const DEVICE_GLOBAL_SYNCED: readonly string[] = ["qc:locale"];

export function isDeviceGlobalKey(key: string): boolean {
  return DEVICE_GLOBAL.has(key);
}

let owner: string | null = null;

function readPersistedOwner(): string {
  try {
    return localStorage.getItem(OWNER_KEY) || ANON_OWNER;
  } catch {
    return ANON_OWNER;
  }
}

/**
 * The owner whose bucket the app reads and writes right now. Resolved
 * SYNCHRONOUSLY: storage reads happen on first paint, long before the auth
 * bridge finishes hydrating, and defaulting to "anon" in the meantime would
 * flash the wrong bucket on every reload for a signed-in user.
 */
export function currentOwner(): string {
  if (owner === null) owner = readPersistedOwner();
  return owner;
}

/** Sign-in passes the sub; sign-out passes null (back to the anon bucket).
 *  Signing out does NOT delete anything — the bucket simply stops being read,
 *  so signing back in restores everything instantly, even offline. */
export function setCurrentOwner(sub: string | null): void {
  const next = sub || ANON_OWNER;
  const changed = currentOwner() !== next;
  owner = next;
  try {
    if (sub) localStorage.setItem(OWNER_KEY, sub);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    /* storage unavailable — the in-memory owner still scopes this session */
  }
  // Changing owner changes which progress is visible just as surely as grading
  // does, so it belongs on the same channel: without this, the nav badge and
  // workspace would keep rendering the previous bucket's numbers until some
  // unrelated event happened to invalidate them.
  if (changed && typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROGRESS_EVENT_NAME));
  }
}

/**
 * The ANONYMOUS bucket IS the flat canonical namespace ("qc:card:x"); a
 * signed-in account gets "qc:o:<sub>:card:x".
 *
 * That asymmetry is deliberate and it is the whole trick. Data written before
 * this refactor has a genuinely unknown owner, and the safe home for unowned
 * work is exactly the anonymous bucket — so legacy data simply IS the anon
 * bucket and there is no migration to get wrong, no rename to half-complete,
 * and no window where a user's history looks deleted. Isolation is unaffected:
 * accounts are prefixed and therefore invisible to each other and to anon.
 */
export function ownerPrefix(who: string = currentOwner()): string {
  return who === ANON_OWNER ? CANONICAL_PREFIX : `${SCOPE_PREFIX}${who}:`;
}

/** canonical -> local. Device-global keys pass through untouched. */
export function toLocalKey(canonicalKey: string, who: string = currentOwner()): string {
  if (isDeviceGlobalKey(canonicalKey)) return canonicalKey;
  if (!canonicalKey.startsWith(CANONICAL_PREFIX)) return canonicalKey;
  return ownerPrefix(who) + canonicalKey.slice(CANONICAL_PREFIX.length);
}

/** local -> canonical. Slices a known prefix rather than splitting on ":" —
 *  card ids embed their own colons (qc:card:challenge:bell-pair). */
export function toCanonicalKey(localKey: string, who: string = currentOwner()): string {
  if (isDeviceGlobalKey(localKey)) return localKey;
  const prefix = ownerPrefix(who);
  if (!localKey.startsWith(prefix)) return localKey;
  return CANONICAL_PREFIX + localKey.slice(prefix.length);
}

/** Every local key in one owner's bucket — and never another's. */
export function ownedLocalKeys(who: string = currentOwner()): string[] {
  const prefix = ownerPrefix(who);
  const anon = who === ANON_OWNER;
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      // The anon bucket is the flat namespace, so it must explicitly exclude
      // every ACCOUNT bucket (which also starts with "qc:") and the
      // device-global keys — otherwise "anonymous" would see everyone.
      if (anon && (k.startsWith(SCOPE_PREFIX) || isDeviceGlobalKey(k))) continue;
      keys.push(k);
    }
  } catch {
    /* storage unavailable — an empty bucket is the honest answer */
  }
  return keys;
}

/** How much unclaimed anonymous work is sitting on this device. Drives the
 *  "add this device's progress to your account?" prompt — the user is asked
 *  BEFORE anything moves, so no account silently absorbs a stranger's work. */
export function anonBucketSize(): number {
  return ownedLocalKeys(ANON_OWNER).length;
}

/**
 * Move the anonymous bucket into an account's bucket, on explicit consent only.
 * Existing account values WIN: this is additive adoption of unowned work, never
 * an overwrite of what the account already did.
 */
export function claimAnonBucket(sub: string): number {
  let claimed = 0;
  try {
    for (const anonKey of ownedLocalKeys(ANON_OWNER)) {
      const value = localStorage.getItem(anonKey);
      if (value === null) continue;
      const target = toLocalKey(toCanonicalKey(anonKey, ANON_OWNER), sub);
      if (localStorage.getItem(target) === null) {
        localStorage.setItem(target, value);
        claimed++;
      }
      localStorage.removeItem(anonKey);
    }
  } catch {
    /* storage unavailable */
  }
  return claimed;
}

/** Discard the anonymous bucket without claiming it ("start clean"). */
export function discardAnonBucket(): number {
  const keys = ownedLocalKeys(ANON_OWNER);
  try {
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
  return keys.length;
}

/** Test hook — module state, like the sync health store. */
export function resetOwnerForTests(): void {
  owner = null;
}
