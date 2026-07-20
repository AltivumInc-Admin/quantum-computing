"use client";

import BlochSphere3D from "./bloch-sphere-3d-lazy";
import {
  ErrorCard as SharedErrorCard,
  EyebrowLabel,
  WidgetCard,
} from "./widget-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "./math";
import {
  parseScrolly,
  interpolateState,
  stateForBeat,
  activeBeatIndex,
  type Beat,
} from "./scrolly";
import { BlochDial, BlochVectorSR } from "./bloch-dial";
import { usePrefersReducedMotion, useWebGL } from "./use-display-caps";

/**
 * A scroll-driven explorable rendered from a ```qscrolly fenced block. A sticky
 * Bloch sphere stays pinned while captioned "beats" scroll past; the state vector
 * morphs continuously with scroll position (interpolated by scrolly.ts), so a
 * concept unfolds as the reader reads — the Ciechanowski/Distill pattern.
 *
 * Progressive enhancement: when motion is allowed and WebGL is present, the 3D
 * sphere is scroll-linked. Otherwise (reduced motion, no WebGL, or the server
 * prerender) it degrades to a static, stacked list of beats — each a caption
 * beside a 2D Bloch dial — with no sticky behavior and no scroll coupling. The
 * caps hooks return false on the server, so the static export ships the fallback
 * and upgrades after hydration, exactly like the 3D scrubber.
 */

function ErrorCard({ message }: { message?: string }) {
  return <SharedErrorCard label="scrolly" className="my-8" message={message} />;
}

/** Static, accessible fallback: every beat shown at once. */
function StaticBeats({ beats }: { beats: Beat[] }) {
  return (
    <WidgetCard eyebrow="Walkthrough" className="my-8">
      <ol className="list-none m-0 p-0 divide-y divide-(--bd)">
        {beats.map((beat, i) => (
          <li key={i} className="flex items-center gap-4 px-4 sm:px-5 py-4">
            <div className="shrink-0">
              <BlochDial state={stateForBeat(beat)} />
            </div>
            <p className="text-[0.95rem] leading-relaxed text-caption">
              {beat.caption}
            </p>
          </li>
        ))}
      </ol>
    </WidgetCard>
  );
}

/** The scroll-linked explorable: sticky sphere + caption driven by scroll depth. */
function Explorable({ beats }: { beats: Beat[] }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      // Progress 0 when the section top reaches the viewport top; 1 when its
      // bottom reaches the viewport bottom. Linked to native scroll only.
      setProgress(span > 0 ? clamp(-rect.top / span, 0, 1) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const state = useMemo(() => interpolateState(beats, progress), [beats, progress]);
  const active = activeBeatIndex(beats, progress);

  return (
    <div
      ref={sectionRef}
      className="not-prose relative my-10"
      style={{ height: `${beats.length * 85}vh` }}
    >
      <div className="sticky top-24 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
        <div className="shrink-0">
          <BlochSphere3D state={state} />
          {/* the 3D canvas is aria-hidden; keep the vector readout AT-visible
              (and outside the aria-live beat column) */}
          <BlochVectorSR state={state} />
        </div>
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          {/* The explorable weight (font-medium), matching the WidgetCard
              eyebrows of every sibling widget on the same lesson page — the
              hand-rolled copies this replaced had drifted to font-semibold. */}
          <EyebrowLabel className="block mb-2">
            Beat {active + 1} / {beats.length}
          </EyebrowLabel>
          <div className="relative min-h-24">
            {beats.map((beat, i) => (
              <p
                key={i}
                aria-hidden={i === active ? undefined : true}
                className={`text-lg leading-relaxed transition-opacity duration-300 ${
                  i === active
                    ? "text-(--ink) opacity-100"
                    : "pointer-events-none absolute inset-0 text-caption opacity-0"
                }`}
              >
                {beat.caption}
              </p>
            ))}
          </div>
          {/* progress rail */}
          <div className="mt-6 h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-(--track)">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-warm"
              style={{ width: `${(progress * 100).toFixed(1)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScrollySection({ source }: { source: string }) {
  const parsed = useMemo(() => parseScrolly(source), [source]);
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGL();

  if (!parsed.spec) return <ErrorCard message={parsed.error} />;

  const beats = parsed.spec.beats;
  if (reduced || !webgl) return <StaticBeats beats={beats} />;
  return <Explorable beats={beats} />;
}
