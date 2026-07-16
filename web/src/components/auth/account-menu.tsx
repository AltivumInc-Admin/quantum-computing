"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useAuth } from "./auth-provider";

// Keep in sync with the menuitems rendered below (Workspace, Sign out): the roving
// tabindex / arrow-key model is hand-indexed against this count.
const ITEM_COUNT = 2;

export function AccountMenu() {
  const { status, email, signOut } = useAuth();
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
        className="inline-flex items-center whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-accent dark:hover:text-accent-light interactive focus-ring"
      >
        Sign in
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
    <div ref={containerRef} className="relative">
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
        className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-accent dark:hover:text-accent-light interactive focus-ring"
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
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          onBlur={(e) => {
            // Close once focus leaves the menu entirely (Tab/Shift+Tab to an element
            // outside it). Done on focusout so the native Tab completes against the
            // still-mounted menu and lands on the correct next element.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
          }}
          className="absolute right-0 mt-2 w-44 rounded-card border border-gray-200/70 dark:border-white/[0.08] bg-(--surface-1) p-1.5 shadow-(--shadow-resting)"
        >
          <Link
            href="/workspace"
            role="menuitem"
            tabIndex={focusedIndex === 0 ? 0 : -1}
            ref={(el) => {
              itemRefs.current[0] = el;
            }}
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 interactive focus-ring"
          >
            Workspace
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
            className="block w-full rounded-control px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 interactive focus-ring"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
