"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useAuth } from "./auth-provider";
import { useLocale } from "@/i18n";

// Keep in sync with the menuitems rendered below (Workspace, Sign out): the roving
// tabindex / arrow-key model is hand-indexed against this count.
const ITEM_COUNT = 2;

export function AccountMenu() {
  const { status, email, signOut } = useAuth();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const menuId = useId();

  // Close on a click outside the menu while it is open.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Roving focus: when open, move DOM focus to the active menuitem — both on open
  // (lands on the first item) and as arrow keys change the active index.
  useEffect(() => {
    if (open) itemRefs.current[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  // "unconfigured" (no backend) and "configuring" (bridge still hydrating) both
  // render nothing, so an authenticated user never flashes a wrong "Sign in" while
  // the lazily-loaded Amplify bridge resolves the session.
  if (status === "unconfigured" || status === "configuring") return null;

  if (status !== "authenticated") {
    return (
      <Link
        href="/login"
        className="inline-flex items-center whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-(--mut) hover:text-(--ink) interactive focus-ring"
      >
        {t("auth.signIn")}
      </Link>
    );
  }

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openWith = (index: number) => {
    setFocusedIndex(index);
    setOpen(true);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openWith(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openWith(ITEM_COUNT - 1);
    }
    // Enter/Space fire the button's native click (onClick toggles + focuses item 0).
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => (i + 1) % ITEM_COUNT);
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => (i - 1 + ITEM_COUNT) % ITEM_COUNT);
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(ITEM_COUNT - 1);
        break;
      case "Escape":
        e.preventDefault();
        closeAndFocusTrigger();
        break;
      // Tab is intentionally not handled here — closing on the Tab keydown would
      // unmount the focused menuitem before the browser's native Tab runs, dropping
      // focus to <body>. The container's onBlur closes the menu after focus has
      // already moved to the correct next element (APG: Tab closes the menu).
      case "Enter":
      case " ":
        e.preventDefault();
        itemRefs.current[focusedIndex]?.click();
        break;
    }
  };

  return (
    // min-w-0 AND flex on the wrapper, not just the trigger: this div is the
    // ACTUAL flex item inside the nav's action rail, and its `min-width: auto`
    // resolves to the trigger's full intrinsic width — so the chip stayed
    // rigid at its max-w cap and the rail overflowed left across the pill
    // even after the trigger itself got min-w-0. And min-w-0 alone is not
    // enough: as a plain block the wrapper shrinks but nothing forces the
    // inline-flex button inside to follow, so the button spilled out the
    // wrapper's right edge and parked the chevron under the language globe.
    // flex makes the button a flex item of the wrapper, completing the
    // container -> wrapper -> button -> span shrink chain down to truncate.
    // The absolute dropdown anchors to the wrapper as before.
    <div ref={containerRef} className="relative flex min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setFocusedIndex(0);
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
        // Narrower cap on phones: at 12rem the signed-in email alone outgrew
        // the header's top row and pushed the page into sideways scroll. The
        // span truncates, so a long address loses characters, not the layout.
        // min-w-0 matters as much as the caps: without it the button's
        // automatic minimum is the FULL email's min-content (nested truncation
        // needs min-w-0 at every flex level), so it refuses to shrink inside
        // the nav's action rail and overflows left across the centered pill
        // ("PricingReview") the moment the signed-in cluster outgrows its grid
        // track. With it, this chip is the rail's one flexible member and
        // yields width first.
        className="inline-flex min-w-0 max-w-[8rem] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-(--mut) hover:text-(--ink) interactive focus-ring sm:max-w-[12rem]"
      >
        <span className="truncate">{email}</span>
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("auth.accountMenu")}
          onKeyDown={onMenuKeyDown}
          onBlur={(e) => {
            // Close once focus leaves the menu entirely (Tab/Shift+Tab to an element
            // outside it). Done on focusout so the native Tab completes against the
            // still-mounted menu and lands on the correct next element.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
          }}
          className="absolute right-0 mt-2 w-44 rounded-card border border-(--bd) bg-(--surface-1) p-1.5 shadow-(--shadow-resting)"
        >
          <Link
            href="/workspace"
            role="menuitem"
            tabIndex={focusedIndex === 0 ? 0 : -1}
            ref={(el) => {
              itemRefs.current[0] = el;
            }}
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2 text-sm text-(--ink) hover:bg-(--field) interactive focus-ring"
          >
            {t("auth.workspace")}
          </Link>
          <button
            type="button"
            role="menuitem"
            tabIndex={focusedIndex === 1 ? 0 : -1}
            ref={(el) => {
              itemRefs.current[1] = el;
            }}
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="block w-full rounded-control px-3 py-2 text-left text-sm text-(--ink) hover:bg-(--field) interactive focus-ring"
          >
            {t("auth.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
