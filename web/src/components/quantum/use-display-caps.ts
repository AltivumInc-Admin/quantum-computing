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

// The three useSyncExternalStore arguments are hoisted to module scope, not
// written inline at the call site. React stores the subscription as an effect
// keyed on `subscribe`'s IDENTITY, so an inline closure — freshly allocated on
// every render — tears the listener down and re-adds it on every commit of
// every consumer. Since these hooks feed the hot, slider-driven widgets, that
// is a removeEventListener/addEventListener pair per drag frame, exactly the
// churn the memoized probes above were written to eliminate. (Same pattern as
// use-persistent-solved.ts, which already passes a module-level subscribe.)
function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = reducedMq();
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}

function getReducedMotion(): boolean {
  return reducedMq()?.matches ?? false;
}

/** A store that never notifies (session-invariant capabilities). */
function subscribeNever(): () => void {
  return noop;
}
function noop(): void {}

/** Stable server snapshot: the static export prerenders the safe fallback. */
function serverFalse(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, serverFalse);
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
  return useSyncExternalStore(subscribeNever, detectWebGLCached, serverFalse);
}
