"use client";

import { useState, type ReactNode } from "react";
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
  const showLang = !!language && language !== "text";

  return (
    <div className="not-prose group relative my-5 overflow-hidden rounded-xl border border-gray-800 bg-gray-900 dark:bg-gray-900/80">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        {showLang && (
          <span className="rounded bg-gray-800/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {language!.toUpperCase()}
          </span>
        )}
        <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
      <pre
        className={`overflow-x-auto px-4 py-3.5 text-sm leading-relaxed text-gray-200 ${
          wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
        }`}
      >
        {children}
      </pre>
    </div>
  );
}
