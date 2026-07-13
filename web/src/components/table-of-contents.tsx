"use client";

import { useEffect, useMemo, useState } from "react";
import type { Heading } from "@/lib/extract-headings";

// Track which heading is currently in view. The rootMargin pushes the trigger
// line up to ~30% from the top so a heading becomes "active" as it nears the top
// of the viewport, and the active pick is the topmost heading still on screen.
function useActiveHeading(slugs: string[]): string | null {
  const key = slugs.join("|");
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const list = key ? key.split("|") : [];
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // Topmost heading still on screen, or null when scrolled into the
        // intro area above the first tracked heading (so no entry stays stale).
        setActive(list.find((slug) => visible.has(slug)) ?? null);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );

    list.forEach((slug) => {
      const el = document.getElementById(slug);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [key]);

  return active;
}

/**
 * "On this page" outline for the current lesson. Anchors jump to the heading ids
 * the renderer stamps from the same slug source, and the entry for whichever
 * heading is in view is highlighted — an accent segment sliding down a continuous
 * rail — as the reader scrolls.
 */
export function TableOfContents({ headings }: { headings: Heading[] }) {
  const slugs = useMemo(() => headings.map((h) => h.slug), [headings]);
  const active = useActiveHeading(slugs);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-caption">
        <span
          aria-hidden="true"
          className="h-px w-4 bg-gradient-to-r from-accent/70 to-transparent"
        />
        On this page
      </p>
      <ul className="space-y-px border-l border-gray-200/70 dark:border-gray-800">
        {headings.map((h) => {
          const isActive = active === h.slug;
          return (
            <li key={h.slug}>
              <a
                href={`#${h.slug}`}
                aria-current={isActive ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1 leading-snug transition-[color,border-color] duration-200 focus-ring ${
                  h.level === 3 ? "pl-6" : "pl-4"
                } ${
                  isActive
                    ? "hue-border hue-text font-medium"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
