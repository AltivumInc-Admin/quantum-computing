"use client";

import { useEffect, useMemo, useState } from "react";
import type { Heading } from "@/lib/extract-headings";

// Track which heading the reader is at. The rootMargin confines intersection
// to the top ~30% of the viewport (the trigger band): the topmost heading in
// the band wins, and once a heading scrolls past the band — while its section
// BODY is being read — it stays active until the next heading takes over.
// Without that retention the highlight would blank for most of any section
// taller than the band (nearly every GUIDE section).
function useActiveHeading(slugs: string[]): string | null {
  const key = slugs.join("|");
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const list = key ? key.split("|") : [];
    const visible = new Set<string>();
    // Headings that crossed above the trigger band — their body is (or was)
    // being read. The deepest one is the fallback when no heading is visible.
    const passed = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) {
            visible.add(id);
            passed.delete(id);
          } else {
            visible.delete(id);
            // Leaving upward (above the viewport top) = scrolled past the
            // band; leaving downward = not reached yet / scrolled back above.
            if (entry.boundingClientRect.top < 0) passed.add(id);
            else passed.delete(id);
          }
        }
        // Topmost heading inside the band wins; otherwise the last heading
        // that scrolled past it. Null only when nothing has been passed —
        // the intro area above the first tracked heading.
        const topmostVisible = list.find((slug) => visible.has(slug));
        if (topmostVisible) {
          setActive(topmostVisible);
          return;
        }
        for (let i = list.length - 1; i >= 0; i--) {
          if (passed.has(list[i])) {
            setActive(list[i]);
            return;
          }
        }
        setActive(null);
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
      <ul className="space-y-px border-l border-(--bd)">
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
                    : "border-transparent text-(--mut) hover:border-(--bd-2) hover:text-(--ink)"
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
