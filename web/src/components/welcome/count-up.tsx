"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/quantum/use-display-caps";

/**
 * Animated integer readout: rewinds to 0 and counts up to `value` with an
 * exponential ease-out once the element first enters the viewport.
 *
 * SSR, no-JS, and the hydration render all show the true final value — the
 * rewind only happens on the client after mount, so the markup never
 * mismatches and crawlers never see a zero. The counting span is aria-hidden
 * with an sr-only twin, so assistive tech reads the real number exactly once,
 * never the intermediate frames. Reduced-motion users keep the static value.
 */
export function CountUp({
  value,
  durationMs = 1400,
  startDelayMs = 0,
}: {
  value: number;
  durationMs?: number;
  startDelayMs?: number;
}) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / durationMs);
        // ease-out-expo — fast launch, long settle, the same family as the
        // site's cubic-bezier(0.22, 1, 0.36, 1) entrances.
        const eased = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
        setShown(Math.round(eased * value));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      setShown(0);
      timer = setTimeout(run, startDelayMs);
    };

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === "undefined") {
      start();
    } else {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io?.disconnect();
            start();
          }
        },
        { threshold: 0.4 },
      );
      io.observe(el);
    }

    return () => {
      io?.disconnect();
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [value, durationMs, startDelayMs, reduced]);

  // Reduced motion renders the truth directly — including a live preference
  // flip mid-count — with no state write, so the effect never cascades.
  const display = reduced ? value : shown;

  return (
    <span ref={ref}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
