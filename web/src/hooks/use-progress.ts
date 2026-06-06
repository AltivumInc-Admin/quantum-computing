"use client";

import { useSyncExternalStore } from "react";
import {
  subscribe,
  isSectionComplete,
  completedCount,
} from "@/lib/progress-store";

// useSyncExternalStore keeps these reads hydration-safe: the server snapshot is
// always the "empty" state (false / 0), and the client re-reads localStorage
// after mount, matching the pattern the Challenge component already uses.

export function useSectionComplete(slug: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isSectionComplete(slug),
    () => false
  );
}

export function useCompletedCount(slugs: string[]): number {
  return useSyncExternalStore(
    subscribe,
    () => completedCount(slugs),
    () => 0
  );
}
