// Client-side learner progress, persisted in localStorage. This module OWNS
// the shared "qc-progress" channel: it re-exports PROGRESS_EVENT_NAME (single-
// sourced in progress-event.ts), and every other writer — the Rep widgets via
// usePersistentSolved, the review and circuit stores, the sync merge — imports
// the constant to dispatch the same event. Keeping a single channel means a
// solved challenge and a completed section both notify any subscriber
// (sidebar, progress bar, sync debounce) through one listener.
//
// Every function is guarded for SSR / private-mode storage failures: reads
// fall back to "incomplete", writes fall back to an in-memory session map (the
// control keeps working; the progress just isn't remembered next visit).
// Sections are the unit of progress; completion is an explicit learner action
// ("Mark as complete").

import { PROGRESS_EVENT_NAME } from "./progress-event";
import { registerLocalDeletion, clearLocalDeletion } from "./progress-merge";
import { recordActivity } from "./activity-log";

const sectionKey = (slug: string) => `qc:section:${slug}`;

// When localStorage itself is blocked (Chrome/Safari with site data off),
// flags land here instead, so "Mark as complete" is never a dead control:
// the toggle, sidebar checkmarks and counts all keep working through the
// normal read path — the progress just isn't remembered past this session,
// which is exactly the degradation the header promises.
const memoryFlags = new Map<string, boolean>();

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return memoryFlags.get(key) === true;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(key, "1");
      recordActivity(); // completing a section is Runbook activity (rides this dispatch)
      clearLocalDeletion(key);
    } else {
      localStorage.removeItem(key);
      // Tombstone the deletion for this session so the next sync merge does
      // not silently re-adopt the server's copy under the learner's click.
      registerLocalDeletion(key);
    }
  } catch {
    memoryFlags.set(key, value); // storage blocked — remember for this session
  }
  // Both outcomes notify subscribers; only SSR (no window) stays silent.
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROGRESS_EVENT_NAME));
}

export function isSectionComplete(slug: string): boolean {
  return readFlag(sectionKey(slug));
}

export function setSectionComplete(slug: string, complete: boolean): void {
  writeFlag(sectionKey(slug), complete);
}

export function toggleSectionComplete(slug: string): void {
  setSectionComplete(slug, !isSectionComplete(slug));
}

export function completedCount(slugs: string[]): number {
  return slugs.reduce((n, slug) => (isSectionComplete(slug) ? n + 1 : n), 0);
}

/**
 * Subscribe to progress changes. Listens to the in-tab "qc-progress" event and
 * the cross-tab "storage" event so progress stays in sync across windows.
 * Returns an unsubscribe function.
 */
export function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // The cross-tab "storage" event fires for EVERY localStorage write in the app
  // (theme, review cards, pyodide cache, ...). Only react to our own keys — or a
  // full clear, where key is null — so unrelated writes don't recompute progress.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key?.startsWith("qc:")) callback();
  };
  window.addEventListener(PROGRESS_EVENT_NAME, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PROGRESS_EVENT_NAME, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export { PROGRESS_EVENT_NAME };
