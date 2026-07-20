"use client";

import { type ComponentPropsWithoutRef } from "react";
import { useScrollRegion } from "@/hooks/use-scroll-region";

/**
 * Overflow container for GFM tables in lesson prose. A gate table whose cells
 * hold KaTeX matrices (white-space: nowrap) is far wider than a phone's ~343px
 * content box, so without this wrapper the entire lesson page scrolls
 * horizontally (WCAG 1.4.10 reflow).
 *
 * Follows CodeBlock's measure-then-expose idiom (single-sourced in
 * useScrollRegion): the wrapper becomes a keyboard-focusable, labelled scroll
 * region ONLY when the table actually overflows, so narrow tables add no tab
 * stops. Re-measures on resize.
 */
export function MarkdownTable(props: ComponentPropsWithoutRef<"table">) {
  const { regionProps } = useScrollRegion<HTMLDivElement>("Scrollable table");

  return (
    <div {...regionProps}>
      <table {...props} />
    </div>
  );
}
