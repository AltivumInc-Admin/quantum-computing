"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The house measure-then-expose scroll-region idiom, single-sourced.
 *
 * A horizontally overflowing container is a scroll region: WCAG 1.4.10 (reflow)
 * plus 2.1.1 (keyboard) require that its hidden content be reachable without a
 * pointer. Browsers expose an implicit focusable scroller only when the region
 * has NO focusable children, so any container with controls inside it (the
 * device table's sort buttons, for instance) must opt in explicitly.
 *
 * Exposure is conditional on actually overflowing, so a container that fits adds
 * no tab stop and no redundant landmark. Re-measures on resize via
 * ResizeObserver (guarded — jsdom and older engines lack it).
 *
 * Spread `regionProps` onto the scrolling element; it carries the ref, the
 * conditional `tabIndex`/`role`/`aria-label`, and the `overflow-x-auto` +
 * conditional `focus-ring` class recipe.
 */
export function useScrollRegion<T extends HTMLElement>(label: string) {
  const ref = useRef<T>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScrollable(el.scrollWidth > el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return {
    scrollable,
    regionProps: {
      ref,
      tabIndex: scrollable ? 0 : undefined,
      role: scrollable ? ("region" as const) : undefined,
      "aria-label": scrollable ? label : undefined,
      className: `overflow-x-auto${scrollable ? " focus-ring" : ""}`,
    },
  };
}
