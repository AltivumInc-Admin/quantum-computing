"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { getSections } from "@/lib/sections";

export function Sidebar() {
  const pathname = usePathname();
  const sections = getSections();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden fixed bottom-4 right-4 z-50 p-3 rounded-full bg-accent text-white shadow-lg"
        aria-label="Toggle navigation"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-16 left-0 z-40 w-72 h-[calc(100vh-4rem)] overflow-y-auto border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6 transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">
          Learning Path
        </p>
        <nav className="space-y-1">
          {sections.map((section) => {
            const isActive = pathname === `/learn/${section.slug}`;
            return (
              <Link
                key={section.slug}
                href={`/learn/${section.slug}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900"
                }`}
              >
                <span className="shrink-0 w-6 h-6 rounded text-xs font-bold flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                  {String(section.index).padStart(2, "0")}
                </span>
                <span className="truncate">{section.title}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
