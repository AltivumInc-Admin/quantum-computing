"use client";

import { isModifiedClick, TransitionLink } from "@/components/transition-link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { getSections, type Section } from "@/lib/sections";
import { useSectionComplete, useCompletedCount } from "@/hooks/use-progress";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { DRAWER_INERT_REGION_IDS } from "@/lib/layout-regions";

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
  onNavigate: (e: MouseEvent<HTMLAnchorElement>) => void;
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
          : "text-(--mut) hover:bg-(--field) hover:text-(--ink)"
      }`}
    >
      <span
        className={`shrink-0 w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center transition-all duration-300 ${
          complete
            ? "bg-accent-dark text-white shadow-sm shadow-accent/40"
            : isActive
              ? "hue-soft-bg hue-text"
              : "bg-(--field) text-caption"
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
  // The trap container wraps BOTH the X toggle and the drawer, so the visible
  // close affordance sits inside the Tab cycle (X → drawer links → back to X)
  // instead of stranded outside the trap.
  const wrapRef = useRef<HTMLDivElement>(null);
  const trapFocus = useFocusTrap(wrapRef);

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

    // Every interactive region outside the drawer — header, lesson body,
    // footer, tutor pill — goes inert. The ids are shared constants
    // (lib/layout-regions.ts) imported by their owners, so a rename breaks
    // loudly instead of silently voiding this protection.
    const regions = DRAWER_INERT_REGION_IDS.map((id) =>
      document.getElementById(id)
    );
    for (const region of regions) region?.setAttribute("inert", "");

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      trapFocus(e);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      for (const region of regions) region?.removeAttribute("inert");
      document.body.style.overflow = prevOverflow;
    };
    // trapFocus is a stable useCallback (keyed on the ref), so it never
    // re-triggers this open/close effect.
  }, [open, trapFocus]);

  return (
    // The wrapper is the focus-trap container (see wrapRef above). Every child
    // is position:fixed, so the div itself takes no space in the page flow.
    <div ref={wrapRef}>
      {/* Mobile toggle — the system's primary-control recipe (.surface-accent:
          neutral high-contrast fill, theme-aware icon ink). Never the olive
          gradient: white-on-accent fails WCAG 1.4.11 non-text contrast (see
          contrast-guard.test.ts). Lifted above the modal scrim while open. */}
      <button
        ref={toggleRef}
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls={asideId}
        className={`lg:hidden fixed bottom-4 right-4 ${
          open ? "z-[70]" : "z-50"
        } p-3 rounded-full surface-accent interactive focus-ring`}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>

      {/* Overlay — stacked above every non-drawer fixed element (site header
          and tutor pill are z-50) so nothing interactive floats on the scrim
          while the drawer claims aria-modal. */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          onClick={close}
        />
      )}

      {/* Sidebar. Below lg the closed state pairs the slide-out transform with
          visibility:hidden — visibility is discretely animatable, so it flips
          to hidden only at the END of the slide-out (animation preserved) and
          back to visible immediately on open. That removes the seven off-screen
          links from the tab order and the accessibility tree while closed;
          lg+ (always-visible sidebar) is untouched. Height prefers the dynamic
          viewport (100dvh) so the drawer tail clears iOS Safari's toolbar,
          with the 100vh calc as the natural fallback. */}
      <aside
        ref={asideRef}
        id={asideId}
        tabIndex={-1}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Learning path navigation" : undefined}
        className={`fixed top-16 left-0 w-72 h-[calc(100vh-4rem)] supports-[height:100dvh]:h-[calc(100dvh-4rem)] overflow-y-auto border-r border-(--bd) bg-[color-mix(in_oklab,var(--surface-1)_95%,transparent)] dark:bg-[color-mix(in_oklab,var(--surface-2)_95%,transparent)] backdrop-blur-xl p-6 outline-none transition-[transform,visibility] motion-reduce:transition-none lg:translate-x-0 ${
          open
            ? "z-[60] translate-x-0 max-lg:visible"
            : "z-40 -translate-x-full max-lg:invisible"
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-dark dark:text-accent font-mono mb-3">
          Learning Path
        </p>

        {/* Overall progress */}
        <div className="mb-5 rounded-control border border-(--bd) bg-(--field) p-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-medium text-caption">
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
            className="h-1.5 w-full overflow-hidden rounded-full bg-(--track)"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-dark transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{
                width: `${pct}%`,
                // Theme-aware glow token — matches the bar's olive fill (the
                // hardcoded teal here predated the PR #169 accent change).
                boxShadow: pct > 0 ? "0 0 8px var(--bar-glow)" : undefined,
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
              onNavigate={(e) => {
                // A modified/aux click opens the lesson in a NEW tab — nothing
                // navigated here, so the drawer stays put. Same predicate as
                // TransitionLink's own browser-owned-click guard, so the two
                // can never drift.
                if (isModifiedClick(e)) return;
                setOpen(false);
              }}
            />
          ))}
        </nav>
      </aside>
    </div>
  );
}
