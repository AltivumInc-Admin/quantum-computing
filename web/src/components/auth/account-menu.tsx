"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";

export function AccountMenu() {
  const { status, email, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (status === "unconfigured") return null;

  if (status !== "authenticated") {
    return (
      <Link
        href="/login"
        className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-accent dark:hover:text-accent-light interactive focus-ring"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-accent dark:hover:text-accent-light interactive focus-ring"
      >
        <span className="truncate">{email}</span>
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-card border border-gray-200/70 dark:border-white/[0.08] bg-(--surface-1) p-1.5 shadow-(--shadow-resting)"
        >
          <Link
            href="/workspace"
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 interactive focus-ring"
          >
            Workspace
          </Link>
          <button
            type="button"
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
