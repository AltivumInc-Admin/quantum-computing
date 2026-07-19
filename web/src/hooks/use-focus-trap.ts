"use client";

import { useCallback, type RefObject } from "react";

// One canonical focus-trap for every modal surface (section gate, mobile
// sidebar drawer, tutor slide-over). Before this hook each dialog carried its
// own copy of the Tab-cycle logic with a silently drifting FOCUSABLE selector;
// this is the union of those variants, with disabled form controls excluded.

/** Everything a dialog considers tabbable when cycling focus. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The structural subset of a keydown event the trap needs — satisfied by both
    React synthetic events and native KeyboardEvents, so callers can wire the
    handler as an onKeyDown prop or a document listener. */
interface TrapKeyEvent {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
}

/**
 * Tab/shift-Tab focus cycling inside a container. Returns a stable keydown
 * handler that wraps Tab-on-last to the first focusable and shift-Tab-on-first
 * to the last. Shift-Tab also wraps when the container itself holds focus —
 * dialogs focus themselves (tabIndex={-1}) on open, and without this case the
 * first backward Tab would escape the trap.
 *
 * The hook owns ONLY the trap: Escape handling, focus restore on close, body
 * scroll locking, and inert marking stay with each dialog.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>
): (event: TrapKeyEvent) => void {
  return useCallback(
    (event: TrapKeyEvent) => {
      const container = containerRef.current;
      if (event.key !== "Tab" || !container) return;
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [containerRef]
  );
}
