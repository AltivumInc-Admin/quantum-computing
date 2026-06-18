"use client";

import { useRef, useState } from "react";

/**
 * One reusable copy-to-clipboard button for every paste-worthy surface (code
 * fences, the Dirac state, the challenge editor, notebook paths). Uses the
 * async Clipboard API with a synchronous execCommand fallback for insecure or
 * unsupported contexts, swaps to a check icon + a polite live-region "Copied"
 * announcement for ~1.5s, and is fully keyboard-operable. No emoji.
 */

function ClipboardIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

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
  className = "",
}: {
  getText: () => string;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control interactive focus-ring ${
        failed
          ? "text-warm-dark dark:text-warm-light"
          : "text-gray-400 hover:bg-accent/10 hover:text-accent dark:hover:text-accent-light"
      } ${className}`}
    >
      {copied ? <CheckIcon /> : failed ? <FailIcon /> : <ClipboardIcon />}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copied" : failed ? "Copy failed" : ""}
      </span>
    </button>
  );
}
