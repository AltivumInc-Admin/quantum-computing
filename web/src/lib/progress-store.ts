// Client-side learner progress, persisted in localStorage and broadcast over the
// same "qc-progress" event the Challenge component already dispatches. Keeping a
// single channel means a solved challenge and a completed section both notify any
// subscriber (sidebar, progress bar) through one listener.
//
// Every function is guarded for SSR / private-mode storage failures: reads fall
// back to "incomplete", writes silently no-op. Sections are the unit of progress;
// completion is an explicit learner action ("Mark as complete").

const PROGRESS_EVENT = "qc-progress";

const sectionKey = (slug: string) => `qc:section:${slug}`;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event(PROGRESS_EVENT));
  } catch {
    /* storage unavailable — progress just isn't remembered this session */
  }
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
  window.addEventListener(PROGRESS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(PROGRESS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export const PROGRESS_EVENT_NAME = PROGRESS_EVENT;
