"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CopyButton } from "./copy-button";

/**
 * Wrapper for default (non-widget) GUIDE code fences. Preserves the
 * rehype-highlight token spans by rendering the original <code> children,
 * adds a copy button (copying the RAW source, never the chip or token markup),
 * a language chip, and a word-wrap toggle. Uses not-prose and replicates the
 * dark block styling so the chrome is fully controlled; github-dark token
 * colors come from the global .hljs styles.
 */

function WrapIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h11a3 3 0 010 6h-3m0 0l2-2m-2 2l2 2M4 18h4" />
    </svg>
  );
}

export function CodeBlock({
  rawText,
  language,
  children,
}: {
  rawText: string;
  language?: string;
  children: ReactNode;
}) {
  const [wrap, setWrap] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const showLang = !!language && language !== "text";

  // A horizontally-overflowing code block is a scroll region; make it keyboard-
  // focusable and labelled only when it actually overflows and isn't wrapped, so
  // not every block becomes a tab stop. Re-measure on resize and on wrap toggle.
  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const measure = () => setScrollable(el.scrollWidth > el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrap]);

  const canScroll = scrollable && !wrap;

  return (
    <div className="not-prose group relative my-5 overflow-hidden rounded-xl border border-gray-800 bg-gray-900 dark:bg-gray-900/80">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        {showLang && (
          <span className="rounded bg-gray-800/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400 opacity-100 can-hover:opacity-0 can-hover:transition-opacity can-hover:group-hover:opacity-100 group-focus-within:opacity-100">
            {language!.toUpperCase()}
          </span>
        )}
        <div className="flex items-center gap-0.5 opacity-100 can-hover:opacity-0 can-hover:transition-opacity can-hover:group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            aria-label="Toggle word wrap"
            aria-pressed={wrap}
            className="inline-flex h-8 w-8 items-center justify-center rounded-control bg-gray-800/80 text-gray-400 hover:text-gray-100 interactive focus-ring"
          >
            <WrapIcon />
          </button>
          <CopyButton getText={() => rawText} className="bg-gray-800/80 text-gray-300 hover:text-white" />
        </div>
      </div>
      {/* On touch devices the chrome above is permanently visible, so the pre
          reserves headroom for it (pt-12); hover-capable devices keep the
          compact padding since their chrome only appears on hover/focus.
          Without the reserve, the tail of the first code lines scrolls under
          ~120px of opaque chip/buttons on a phone. */}
      <pre
        ref={preRef}
        tabIndex={canScroll ? 0 : undefined}
        role={canScroll ? "region" : undefined}
        aria-label={canScroll ? `${language ?? "code"} snippet` : undefined}
        className={`overflow-x-auto px-4 pb-3.5 pt-12 can-hover:pt-3.5 text-sm leading-relaxed text-gray-200 ${
          canScroll ? "focus-ring " : ""
        }${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
      >
        {children}
      </pre>
    </div>
  );
}
