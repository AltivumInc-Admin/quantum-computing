"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function CopyLinkButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (older browser / insecure context) — no-op.
    }
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Copy link to this term"
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-chip border border-gray-200 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 interactive focus-ring"
      }
    >
      <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656l-1.5 1.5" />
      </svg>
      <span>{copied ? "Copied" : "Copy link"}</span>
      <span className="sr-only" aria-live="polite">{copied ? "Link copied to clipboard" : ""}</span>
    </button>
  );
}
