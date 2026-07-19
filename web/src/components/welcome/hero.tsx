import type { ReactNode } from "react";

/**
 * Cinematic, framed "smoke-and-glass" welcome hero — a dark rounded shell over a
 * volumetric fog light, with a floating constellation of curriculum nodes, a
 * two-tone display headline, glass chips, faint light streaks, and a powered-by
 * cloud. A self-dark `dark` island so its neutral tokens resolve to their light
 * (dark-theme) values in BOTH app themes; the imagery is literal, not `dark:`.
 *
 * All decorative chrome (constellation nodes, horizons meter, scroll-cue
 * counter) is aria-hidden: the curriculum grid below carries the real,
 * properly structured versions of this information.
 */

const GLYPHS = {
  atom: "M12 4c4 0 8 3.6 8 8s-4 8-8 8-8-3.6-8-8 4-8 8-8Zm0 0c-2.6 3-4 6-4 8s1.4 5 4 8m0-16c2.6 3 4 6 4 8s-1.4 5-4 8",
  wave: "M3 12c2.5-5 4.5-5 7 0s4.5 5 7 0",
  branch: "M6 4v6a4 4 0 0 0 4 4h8M18 10l-2 4 2 4",
  target: "M12 3v3m0 12v3m9-9h-3M6 12H3m14.5-6.5-2 2M8 16l-2 2m10 0-2-2M8 8 6 6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
} as const;

/** Glyph identity travels WITH each node from the page's explicit config —
    no more positional index agreement between two files. */
export type NodeGlyphName = keyof typeof GLYPHS;

type NodeDatum = {
  label: string;
  value: string;
  glyph: NodeGlyphName;
  /** corner placement */
  pos: "tl" | "tr" | "bl" | "br";
};

function NodeGlyph({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function Node({ node }: { node: NodeDatum }) {
  const place: Record<NodeDatum["pos"], string> = {
    tl: "left-[6%] top-[26%] sm:left-[10%]",
    tr: "right-[6%] top-[24%] sm:right-[9%] text-right",
    bl: "left-[7%] bottom-[26%] sm:left-[9%]",
    br: "right-[6%] bottom-[24%] sm:right-[9%] text-right",
  };
  const rightSide = node.pos === "tr" || node.pos === "br";
  return (
    // aria-hidden: these fragments precede the h1 in DOM order, and a screen
    // reader must not hit stray "Foundations / 12 notebooks" bits before the
    // page heading — the curriculum grid carries the real structured data.
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-20 hidden lg:block ${place[node.pos]}`}
    >
      <div className={`flex items-center gap-2.5 ${rightSide ? "flex-row-reverse" : ""}`}>
        <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 backdrop-blur-md">
          <NodeGlyph d={GLYPHS[node.glyph]} />
        </span>
        <span className="h-px w-9 bg-gradient-to-r from-white/45 to-transparent" style={rightSide ? { transform: "scaleX(-1)" } : undefined} />
      </div>
      <div className={`mt-2 ${rightSide ? "pr-11 text-right" : "pl-11"}`}>
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-white/95">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {node.label}
        </div>
        <div className="font-mono text-[11px] tracking-wider text-white/55">{node.value}</div>
      </div>
    </div>
  );
}

export function WelcomeHero({
  eyebrow,
  headlineLead,
  headlineDim,
  subtitle,
  ctas,
  stats,
  nodes,
  sectionCount,
}: {
  eyebrow: string;
  headlineLead: string;
  headlineDim: string;
  subtitle: string;
  ctas: ReactNode;
  stats: { value: number | string; label: string }[];
  nodes: NodeDatum[];
  /** Real curriculum size — drives the horizons meter and the scroll-cue
      counter so the decoration can never silently lie when a section lands. */
  sectionCount: number;
}) {
  return (
    <section className="dark relative px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="relative isolate overflow-hidden rounded-frame bg-smoke shadow-[0_50px_120px_-45px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06]">
        {/* Volumetric fog light. srcSet restores the responsive pattern for
            the LCP-priority image: phones fetch the 960w cut, not 2688px. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, pre-sized WebP */}
        <img
          src="/welcome/hero-fog.webp"
          srcSet="/welcome/hero-fog-960.webp 960w, /welcome/hero-fog.webp 2688w"
          sizes="100vw"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.92]"
        />
        {/* Legibility wash — keep the left/center readable, let the light bloom breathe */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_78%_-10%,transparent_10%,rgba(11,11,12,0.55)_60%,rgba(11,11,12,0.92)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-smoke/40 via-transparent to-smoke" />

        {/* Faint vertical light streaks (soft god-rays), masked to the lower band */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 top-[42%] opacity-60 [mask-image:linear-gradient(180deg,transparent,#000_35%,#000_80%,transparent)]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0 46px, rgba(255,255,255,0.05) 46px 47px, transparent 47px 92px)",
          }}
        />

        {/* Constellation curves connecting the nodes */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 820"
          preserveAspectRatio="none"
          className="absolute inset-0 hidden h-full w-full lg:block"
        >
          <path d="M150 250 C 480 130, 960 130, 1290 300" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.25" />
          <path d="M150 560 C 520 700, 940 700, 1300 560" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.25" />
        </svg>

        {nodes.map((n) => (
          <Node key={n.pos} node={n} />
        ))}

        {/* Content */}
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center sm:py-32 lg:py-36">
          <span className="inline-flex items-center gap-2 rounded-chip border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-[13px] text-white/80 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-signal" />
            {eyebrow}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
            </svg>
          </span>

          <h1 className="mt-7 font-display text-display-2xl font-light tracking-[-0.02em] text-white">
            {/* white/50 keeps the two-tone hierarchy but clears the 3:1
                large-text floor with margin even where the fog bloom
                brightens the ground behind the words. */}
            {headlineLead} <span className="text-white/50">{headlineDim}</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/55">{subtitle}</p>

          <div className="mt-9">{ctas}</div>

          <dl className="mt-14 flex items-center gap-8 sm:gap-12">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-2xl font-light text-white tabular-nums">{s.value}</dd>
                {/* Visual repeat of the dt — hidden from AT so each stat is
                    announced once ("curriculum sections, 7"), not twice. */}
                <dd aria-hidden="true" className="mt-1 text-xs text-white/45">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Scroll cue — bottom-left glass chip. The mono counter indexes the
            curriculum sections (position 1 of sectionCount, matching the
            horizons meter) and is decorative; the aria-label is the truth. */}
        <a
          href="#curriculum"
          aria-label="Scroll to the curriculum"
          className="absolute bottom-5 left-5 z-20 hidden items-center gap-2.5 rounded-chip border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/60 backdrop-blur-md transition-colors hover:text-white/90 sm:flex interactive focus-ring"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full border border-white/15" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-5-5m5 5l5-5" />
            </svg>
          </span>
          <span className="font-mono tracking-wide" aria-hidden="true">
            01 / {String(sectionCount).padStart(2, "0")} · Scroll down
          </span>
        </a>

        {/* Horizons meter — bottom-right. One bar per real curriculum section
            (first = accent), derived from sectionCount so an added section 08
            widens the meter instead of silently lying. Decorative. */}
        <div
          aria-hidden="true"
          className="absolute bottom-6 right-6 z-20 hidden select-none flex-col items-end gap-2 sm:flex"
        >
          <span className="font-mono text-[12px] tracking-wide text-white/55">Quantum horizons</span>
          <div className="flex items-center gap-1">
            <span className="h-1 w-7 rounded-full bg-accent" />
            {Array.from({ length: Math.max(0, sectionCount - 1) }).map((_, i) => (
              <span key={i} className="h-1 w-7 rounded-full bg-white/12" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
