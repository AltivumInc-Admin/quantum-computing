"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One reusable copy-to-clipboard button for every paste-worthy surface (code
 * fences, the Dirac state, the challenge editor, notebook paths). Uses the
 * async Clipboard API with a synchronous execCommand fallback for insecure or
 * unsupported contexts, swaps to a check icon + a polite live-region "Copied"
 * announcement for ~1.5s, and is fully keyboard-operable. No emoji.
 *
 * VARIANTS ARE PROPS, NOT A className OVERRIDE. This component deliberately
 * accepts no `className`: Tailwind resolves same-specificity conflicts by
 * STYLESHEET order, not by the order of names in the attribute, and every base
 * class here is emitted after the utilities a caller would pass — so a trailing
 * override string is silently discarded. Two call sites relied on exactly that
 * and lost: the code-fence chip's `text-gray-300` lost to `.text-caption`
 * (painting var(--mut) at 2.15:1 on the dark chip in the light theme, under the
 * 3:1 WCAG 1.4.11 floor for a permanently-visible control), and the notebook
 * path's `h-6 w-6` lost to `h-8 w-8` (a 32px pill around a 12px glyph in a row
 * built for 11px text). `tone` and `size` SELECT the base classes instead, so
 * no conflicting pair is ever emitted.
 */

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// Box + glyph sized together, so a compact button can never end up as a large
// empty target around a tiny icon.
const SIZE = {
  md: "h-8 w-8 [&_svg]:h-3.5 [&_svg]:w-3.5",
  sm: "h-6 w-6 [&_svg]:h-3 [&_svg]:w-3",
} as const;

// Split so the failed state can swap ONLY the text color: emitting two
// competing `text-*` utilities on one element would reintroduce the same
// stylesheet-order coin flip this component exists to avoid.
const TONE = {
  // On the page's own surfaces: the shared muted tier, olive on hover.
  default: {
    surface: "",
    text: "text-caption hover:bg-accent/10 hover:text-accent dark:hover:text-accent-light",
  },
  // On a pinned-dark chip (the code-fence chrome strip, identical in both
  // themes): gray-300 measures 10.4:1 on gray-800/80 over gray-900.
  "on-dark": { surface: "bg-gray-800/80", text: "text-gray-300 hover:text-white" },
} as const;

const FAILED_TEXT = "text-warm-dark dark:text-warm-light";

// Returns true only if the copy actually succeeded, so the caller never claims
// success on a silent failure (execCommand returning false, or throwing).
function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  getText,
  label = "Copy",
  tone = "default",
  size = "md",
}: {
  getText: () => string;
  label?: string;
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The reset timer outlives the component otherwise: a learner who copies a
  // fence and navigates away inside 1.5s (lesson-to-lesson View Transitions are
  // well under that) leaves it armed on a dead fiber. This is the platform's
  // most-instantiated copy affordance — one per fence — and the house idiom its
  // three siblings already follow (copy-link-button, compose-panel, saved-panel).
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = async () => {
    const text = getText();
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        ok = fallbackCopy(text);
      }
    } catch {
      // Async clipboard rejected (permissions, insecure context) — try the
      // synchronous fallback and trust ONLY its real result.
      ok = fallbackCopy(text);
    }
    setStatus(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 1500);
  };

  const copied = status === "copied";
  const failed = status === "failed";
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : failed ? "Copy failed" : label}
      className={`inline-flex shrink-0 items-center justify-center rounded-control interactive focus-ring ${
        SIZE[size]
      } ${TONE[tone].surface} ${failed ? FAILED_TEXT : TONE[tone].text}`}
    >
      {copied ? <CheckIcon /> : failed ? <FailIcon /> : <ClipboardIcon />}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copied" : failed ? "Copy failed" : ""}
      </span>
    </button>
  );
}
