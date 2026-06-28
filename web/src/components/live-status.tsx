import type { ReactNode } from "react";

/**
 * Polite screen-reader live region for announcing a recomputed result (a verdict,
 * probability, energy, coefficient, a password-criteria milestone, ...) when a
 * select / Run / Optimize / toggle / keystroke changes it. Visually hidden
 * (sr-only); the node stays mounted so aria-live fires on text change. Keep the
 * announcement to one concise line and pass an empty string when there is nothing
 * to announce. Polite, never assertive, to avoid drag/keystroke spam.
 *
 * Single source for both the quantum explorables (re-exported from
 * quantum/widget-ui.tsx) and the auth surface (password-checklist.tsx).
 */
export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {children}
    </p>
  );
}
