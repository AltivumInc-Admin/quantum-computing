"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

/**
 * Overflow container for GFM tables in lesson prose. A gate table whose cells
 * hold KaTeX matrices (white-space: nowrap) is far wider than a phone's ~343px
 * content box, so without this wrapper the entire lesson page scrolls
 * horizontally (WCAG 1.4.10 reflow).
 *
 * Follows CodeBlock's measure-then-expose idiom: the wrapper becomes a
 * keyboard-focusable, labelled scroll region ONLY when the table actually
 * overflows, so narrow tables add no tab stops. Re-measures on resize.
 */
export function MarkdownTable(props: ComponentPropsWithoutRef<"table">) {
  const [scrollable, setScrollable] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScrollable(el.scrollWidth > el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      tabIndex={scrollable ? 0 : undefined}
      role={scrollable ? "region" : undefined}
      aria-label={scrollable ? "Scrollable table" : undefined}
      className={`overflow-x-auto${scrollable ? " focus-ring" : ""}`}
    >
      <table {...props} />
    </div>
  );
}
