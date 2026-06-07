"use client";

import { useSyncExternalStore } from "react";

// External-store hooks (like theme-toggle's pattern) avoid set-state-in-effect
// and give a stable `false` server snapshot so the static export prerenders the
// 2D fallback, then upgrades after hydration.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

export function detectWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function useWebGL(): boolean {
  // WebGL support does not change during a session, so the store never notifies.
  return useSyncExternalStore(
    () => () => {},
    detectWebGL,
    () => false
  );
}
