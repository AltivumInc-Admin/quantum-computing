"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { dueCount, subscribe } from "@/lib/review-store";

/**
 * Header link to the /review page with a live "due now" count. The count reads
 * through useSyncExternalStore (number snapshot — stable for the identity check)
 * so it stays in sync with grading anywhere on the site via the shared
 * "qc-progress" channel, and prerenders as 0 under static export.
 */
export function ReviewNavBadge() {
  const count = useSyncExternalStore(subscribe, () => dueCount(), () => 0);

  return (
    <Link
      href="/review"
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-(--mut) hover:text-accent dark:hover:text-accent-light interactive focus-ring"
    >
      Review
      {count > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-chip bg-accent/15 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-accent-dark dark:text-accent-light">
          {count}
        </span>
      )}
    </Link>
  );
}
