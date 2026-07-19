"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { TransitionLink } from "@/components/transition-link";
import { hueFor } from "@/lib/sections";
import { useFocusTrap } from "@/hooks/use-focus-trap";

export interface GateSection {
  slug: string;
  index: number;
  title: string;
  notebookCount: number;
  /** Manifest-verified browser-runnable count — the notebook note derives from
      it so the dialog never overpromises (06-hybrid-jobs runs on AWS, not here). */
  runnableCount: number;
  pitch: string;
}

interface SectionGateModalProps {
  section: GateSection;
  /** True when the session resolved to signed-in after the dialog opened
      (a click during the brief "configuring" window) — the gate steps aside. */
  authenticated: boolean;
  onClose: () => void;
}

/**
 * The welcome page's sign-up gate: a per-section preview dialog shown in place
 * of navigation for signed-out visitors. It borrows the section's own hue
 * identity (badge, bleed) so the dialog reads as a continuation of the card
 * that opened it. Rendered in a portal only after a click, so it never exists
 * during static export.
 */
export function SectionGateModal({ section, authenticated, onClose }: SectionGateModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const trapFocus = useFocusTrap(dialogRef);
  const titleId = useId();
  const descId = useId();
  const hue = hueFor(section.index);

  // Truthful per-section runnable note. Coverage varies (all of 01, 4 of 6 in
  // 02, none of 06), so the copy states each section's own number instead of
  // a blanket "most" that is false for 06-hybrid-jobs.
  const runNote =
    section.runnableCount === 0
      ? "built to run in your own Braket environment"
      : section.runnableCount === section.notebookCount
        ? section.notebookCount === 1
          ? "it runs right in your browser"
          : "all run right in your browser"
        : `${section.runnableCount} run${section.runnableCount === 1 ? "s" : ""} right in your browser`;

  // Move focus into the dialog on open, hand it back on close (aria-modal
  // claims the page, so it must return what it took). Also lock body scroll.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    trapFocus(e);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <div
        className="animate-backdrop-fade absolute inset-0 bg-[#080c14]/70 backdrop-blur-sm"
        aria-hidden="true"
        onMouseDown={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        style={{ "--hue": hue } as React.CSSProperties}
        className="animate-modal-pop relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-card border border-gray-200/60 bg-(--surface-1) shadow-(--shadow-raised) outline-none dark:border-white/[0.08]"
      >
        {/* Hue bleed header — the same identity the card established. */}
        <div className="section-bleed relative h-16 shrink-0">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-(--surface-1)" />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="interactive focus-ring absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-control text-gray-500 hover:bg-gray-900/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Body scroll is locked while the dialog is open, so the dialog caps
            itself at the viewport (max-h-full on the panel) and this region
            scrolls internally — otherwise short viewports and 200% zoom push
            the close button off-screen with no way to reach it. */}
        <div className="relative -mt-8 min-h-0 overflow-y-auto overscroll-contain p-6 pt-0 sm:p-8 sm:pt-0">
          <div className="mb-4 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="section-badge flex h-10 w-10 shrink-0 items-center justify-center rounded-chip text-base font-bold"
            >
              {String(section.index).padStart(2, "0")}
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest hue-text">
              Section preview
            </span>
          </div>

          <h2
            id={titleId}
            className="font-display text-display-md tracking-tight text-gray-900 text-balance dark:text-white"
          >
            {section.title}
          </h2>

          <p id={descId} className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {section.pitch}
          </p>

          <p className="mt-4 text-xs text-caption tabular-nums">
            {section.notebookCount} hands-on{" "}
            {section.notebookCount === 1 ? "notebook" : "notebooks"} — {runNote}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {authenticated ? (
              <TransitionLink
                href={`/learn/${section.slug}`}
                onClick={onClose}
                className="surface-accent interactive focus-ring inline-flex items-center rounded-control px-5 py-2.5 text-sm font-semibold"
              >
                Continue to section
              </TransitionLink>
            ) : (
              <>
                <Link
                  href="/login?mode=signup"
                  className="surface-accent interactive focus-ring inline-flex items-center rounded-control px-5 py-2.5 text-sm font-semibold"
                >
                  Create a free account
                </Link>
                <Link
                  href="/login"
                  className="interactive focus-ring inline-flex items-center rounded-control border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-900/5 dark:border-white/20 dark:text-white dark:hover:bg-white/5"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>

          {!authenticated && (
            <p className="mt-4 text-xs text-caption">
              Email or Google. No credit card — the entire curriculum and simulator are
              free.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
