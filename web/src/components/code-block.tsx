"use client";

import { useState, type ReactNode } from "react";
import { useScrollRegion } from "@/hooks/use-scroll-region";
import { CopyButton } from "./copy-button";
// github-dark token colors, route-scoped to this component (the only consumer),
// bundled with the reset that keeps the <pre> the sole horizontal scroller.
import "./code-block-theme.css";

/**
 * Wrapper for default (non-widget) GUIDE code fences. Preserves the
 * rehype-highlight token spans by rendering the original <code> children,
 * adds a copy button (copying the RAW source, never the chip or token markup),
 * a language chip, and a word-wrap toggle. Uses not-prose and owns the entire
 * dark block recipe — wrapper background/border/radius here, padding/overflow/
 * type on the <pre> — so the chrome is fully controlled from one place.
 */

// Chrome-reveal recipe, shared byte-for-byte by the language chip and the button
// group so they can never fade at different times: always visible on touch
// (where there is no hover to reveal them), fades in on hover for pointer
// devices, and forced visible while any child holds focus.
const CHROME_REVEAL =
  "opacity-100 can-hover:opacity-0 can-hover:transition-opacity can-hover:group-hover:opacity-100 group-focus-within:opacity-100";

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
  const showLang = !!language && language !== "text";
  const kind = language ?? "code";

  // A horizontally-overflowing code block is a scroll region; the shared hook
  // makes it keyboard-focusable and labelled only when it actually overflows, so
  // not every block becomes a tab stop. `deps: [wrap]` re-measures on the
  // word-wrap toggle (a wrapped pre cannot overflow horizontally, so it drops
  // the exposure by itself); resize is handled by the hook's ResizeObserver.
  const { regionProps } = useScrollRegion<HTMLPreElement>(`${kind} snippet`, {
    deps: [wrap],
    // On touch devices the chrome is permanently visible, so the pre reserves
    // headroom for it (pt-12); hover-capable devices keep the compact padding
    // since their chrome only appears on hover/focus. Without the reserve, the
    // tail of the first code lines scrolls under ~120px of opaque chip/buttons
    // on a phone. rounded-xl matches the wrapper so the pre clips its own
    // scrolled content (and its scrollbar) to the same corner radius.
    className: `rounded-xl px-4 pb-3.5 pt-12 can-hover:pt-3.5 text-sm leading-relaxed text-gray-200 ${
      wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
    }`,
  });

  return (
    // No overflow-hidden: Tailwind v4 paints .focus-ring as an OUTSET box-shadow
    // on the <pre>, whose border box is flush with this element's padding box
    // (the pre is the only in-flow child and carries no margin). Clipping here
    // therefore ate all 4px of ring-offset + ring, and .focus-ring's own
    // outline-none had already removed the UA fallback — a keyboard user tabbing
    // into a wide fence got no visual indication at all. Nothing needs the clip:
    // the pre is transparent and rounds its own content.
    <div className="not-prose group relative my-5 rounded-xl border border-gray-800 bg-gray-900 dark:bg-gray-900/80">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        {showLang && (
          <span
            className={`rounded bg-gray-800/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400 ${CHROME_REVEAL}`}
          >
            {language!.toUpperCase()}
          </span>
        )}
        <div className={`flex items-center gap-0.5 ${CHROME_REVEAL}`}>
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            aria-label="Toggle word wrap"
            aria-pressed={wrap}
            className="inline-flex h-8 w-8 items-center justify-center rounded-control bg-gray-800/80 text-gray-400 hover:text-gray-100 interactive focus-ring"
          >
            <WrapIcon />
          </button>
          {/* A lesson carries many fences, so the accessible name is qualified by
              language — an unlabelled run of identical "Copy" entries in a screen
              reader's button list tells a learner nothing about which fence is
              which. `tone` selects the on-dark chrome as a PROP, never as a
              trailing className: same-layer utilities resolve by stylesheet
              order, so an override string loses to the component's own base. */}
          <CopyButton
            getText={() => rawText}
            label={`Copy ${kind} snippet`}
            tone="on-dark"
          />
        </div>
      </div>
      <pre {...regionProps}>{children}</pre>
    </div>
  );
}
