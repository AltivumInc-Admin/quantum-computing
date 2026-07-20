"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The house measure-then-expose scroll-region idiom, single-sourced. Both
 * consumers — MarkdownTable and CodeBlock — go through here; neither keeps a
 * private copy of the effect or of the conditional-exposure decisions.
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
 * MEASURE THE ELEMENT THAT ACTUALLY SCROLLS. `regionProps.ref` and
 * `regionProps.className` (which carries `overflow-x-auto`) must land on the
 * same element, and nothing inside it may declare its own `overflow-x` — a
 * descendant scroller silently absorbs the overflow, leaving this measurement
 * permanently false and the affordance dead. (That is exactly what the imported
 * highlight.js theme's `pre code.hljs { overflow-x: auto }` did to code fences
 * until code-block-theme.css neutralized it.)
 *
 * Spread `regionProps` onto the scrolling element; it carries the ref, the
 * conditional `tabIndex`/`role`/`aria-label`, and the `overflow-x-auto` +
 * conditional `focus-ring` class recipe.
 *
 * `options.deps` are appended to the measure effect's dependency list for
 * containers whose overflow can change from a state toggle rather than a resize
 * (CodeBlock's word-wrap switch). `options.className` is appended AFTER the
 * recipe, for utilities the caller owns — padding, type, whitespace. Keep it
 * free of anything the recipe already sets: these are same-layer Tailwind
 * utilities, so a conflicting pair resolves by stylesheet order, not by string
 * order, and the caller would silently lose.
 */
export function useScrollRegion<T extends HTMLElement>(
  label: string,
  options?: { deps?: unknown[]; className?: string }
) {
  const { deps = [], className = "" } = options ?? {};
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
    // `deps` is the caller-supplied re-measure trigger and cannot be a literal
    // here; the effect body closes over nothing else that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    scrollable,
    regionProps: {
      ref,
      tabIndex: scrollable ? 0 : undefined,
      role: scrollable ? ("region" as const) : undefined,
      "aria-label": scrollable ? label : undefined,
      className: `overflow-x-auto${scrollable ? " focus-ring" : ""}${
        className ? ` ${className}` : ""
      }`,
    },
  };
}
