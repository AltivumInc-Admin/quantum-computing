"use client";

import { useSyncExternalStore } from "react";

// External-store hooks (like theme-toggle's pattern) avoid set-state-in-effect
// and give a stable `false` server snapshot so the static export prerenders the
// 2D fallback, then upgrades after hydration.
//
// React calls getSnapshot on every render of every consumer (not only when the
// store notifies), and these hooks feed hot-re-rendering widgets (Bloch builder,
// scrubber, scrolly). So the probes below are memoized at module scope — created
// once per session instead of allocating a MediaQueryList / canvas+GL context on
// every read.

let reducedMqRef: MediaQueryList | null = null;
let matchMediaRef: typeof window.matchMedia | null = null;
function reducedMq(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  // Cache the MediaQueryList so getSnapshot does not allocate one per render.
  // `window.matchMedia` is stable for a real session, so this is created once;
  // the identity guard only rebuilds if the function itself is swapped (e.g. a
  // test reassigning the mock between cases).
  if (!reducedMqRef || matchMediaRef !== window.matchMedia) {
    matchMediaRef = window.matchMedia;
    reducedMqRef = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return reducedMqRef;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = reducedMq();
      mq?.addEventListener("change", onChange);
      return () => mq?.removeEventListener("change", onChange);
    },
    () => reducedMq()?.matches ?? false,
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

// WebGL support is invariant for a session, so probe once and cache. Without
// this, useWebGL's getSnapshot would allocate a throwaway canvas + GL context on
// every render of every consumer.
let webglSupport: boolean | undefined;
function detectWebGLCached(): boolean {
  if (webglSupport === undefined) webglSupport = detectWebGL();
  return webglSupport;
}

export function useWebGL(): boolean {
  // WebGL support does not change during a session, so the store never notifies.
  return useSyncExternalStore(
    () => () => {},
    detectWebGLCached,
    () => false
  );
}
