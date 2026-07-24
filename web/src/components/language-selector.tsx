"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, LOCALES, type Locale } from "@/i18n";

const ITEM_COUNT = LOCALES.length;

/**
 * Compact globe + locale code in the nav. Opens a menu of available languages.
 * Mirrors AccountMenu's APG menu pattern (Escape, arrows, focus return).
 */
export function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

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

  useEffect(() => {
    if (open) itemRefs.current[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const select = (next: Locale) => {
    setLocale(next);
    closeAndFocusTrigger();
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex(0);
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex(ITEM_COUNT - 1);
      setOpen(true);
    }
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
      case "Enter":
      case " ":
        e.preventDefault();
        select(LOCALES[focusedIndex]);
        break;
    }
  };

  const code = locale.toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("nav.language")}
        onClick={() => {
          setFocusedIndex(LOCALES.indexOf(locale));
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 py-1.5 text-sm font-medium text-(--mut) hover:bg-(--field) hover:text-(--ink) interactive focus-ring"
      >
        <GlobeIcon />
        <span className="tabular-nums tracking-wide" aria-hidden="true">
          {code}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("nav.languageMenu")}
          onKeyDown={onMenuKeyDown}
          onBlur={(e) => {
            if (!containerRef.current?.contains(e.relatedTarget as Node)) {
              setOpen(false);
            }
          }}
          className="absolute right-0 z-50 mt-1 min-w-[10.5rem] overflow-hidden rounded-card border border-(--bd) bg-(--glass) py-1 shadow-(--shadow-resting) backdrop-blur-xl"
        >
          {LOCALES.map((loc, i) => {
            const selected = loc === locale;
            return (
              <button
                key={loc}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={focusedIndex === i ? 0 : -1}
                onClick={() => select(loc)}
                onMouseEnter={() => setFocusedIndex(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm interactive focus-ring ${
                  selected
                    ? "bg-accent/10 font-medium text-accent-dark dark:text-accent-light"
                    : "text-(--ink) hover:bg-(--field)"
                }`}
              >
                <span className="inline-flex w-4 justify-center" aria-hidden="true">
                  {selected ? <CheckIcon /> : null}
                </span>
                <span>{t(`lang.${loc}`)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
