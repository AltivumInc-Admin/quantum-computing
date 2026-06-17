"use client";

import { TransitionLink } from "@/components/transition-link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { getSections, type Section } from "@/lib/sections";
import { useSectionComplete, useCompletedCount } from "@/hooks/use-progress";

function CheckBadge() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SidebarItem({
  section,
  isActive,
  onNavigate,
}: {
  section: Section;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const complete = useSectionComplete(section.slug);

  return (
    <TransitionLink
      href={`/learn/${section.slug}`}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all duration-150 focus-ring ${
        isActive
          ? "hue-soft-bg hue-text font-medium shadow-sm"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200"
      }`}
    >
      <span
        className={`shrink-0 w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center transition-all duration-300 ${
          complete
            ? "bg-accent text-white shadow-sm shadow-accent/40"
            : isActive
              ? "hue-soft-bg hue-text"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
        }`}
      >
        {complete ? <CheckBadge /> : String(section.index).padStart(2, "0")}
      </span>
      <span className="truncate">{section.title}</span>
      {complete && <span className="sr-only">completed</span>}
    </TransitionLink>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const sections = getSections();
  const [open, setOpen] = useState(false);
  const asideId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  const total = sections.length;
  const completed = useCompletedCount(sections.map((s) => s.slug));
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  // While the mobile drawer is open, behave like a modal dialog: move focus into
  // it, trap Tab within it, mark the rest of the page inert (so AT and pointer/Tab
  // can't reach the background — making the aria-modal claim truthful), lock body
  // scroll, close on Escape, and return focus to the toggle on close.
  useEffect(() => {
    if (!open) return;
    const aside = asideRef.current;
    aside?.focus();

    const header = document.getElementById("site-header");
    const content = document.getElementById("lesson-content");
    header?.setAttribute("inert", "");
    content?.setAttribute("inert", "");

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !aside) return;
      const focusables = aside.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === first || activeEl === aside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      header?.removeAttribute("inert");
      content?.removeAttribute("inert");
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      {/* Mobile toggle */}
      <button
        ref={toggleRef}
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls={asideId}
        className="lg:hidden fixed bottom-4 right-4 z-50 p-3 rounded-full bg-gradient-to-br from-accent to-accent-dark text-white shadow-lg shadow-accent/20 interactive focus-ring hover:shadow-xl"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={asideRef}
        id={asideId}
        tabIndex={-1}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Learning path navigation" : undefined}
        className={`fixed top-16 left-0 z-40 w-72 h-[calc(100vh-4rem)] overflow-y-auto border-r border-gray-200/60 dark:border-gray-800/40 bg-white/95 dark:bg-[color-mix(in_oklab,var(--surface-2)_95%,transparent)] backdrop-blur-xl p-6 outline-none transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 mb-3">
          Learning Path
        </p>

        {/* Overall progress */}
        <div className="mb-5 rounded-control border border-gray-100 dark:border-white/[0.05] bg-gray-50/70 dark:bg-white/[0.02] p-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {completed} of {total} complete
            </span>
            <span className="text-sm font-semibold text-accent-dark dark:text-accent-light tabular-nums">
              {pct}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Learning path progress"
            className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200/70 dark:bg-gray-800"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-dark transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{
                width: `${pct}%`,
                boxShadow:
                  pct > 0 ? "0 0 8px oklch(0.72 0.15 192 / 0.5)" : undefined,
              }}
            />
          </div>
        </div>

        <nav aria-label="Learning path" className="space-y-0.5">
          {sections.map((section) => (
            <SidebarItem
              key={section.slug}
              section={section}
              isActive={pathname === `/learn/${section.slug}`}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}
