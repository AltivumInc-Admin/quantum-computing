import type { ReactNode } from "react";

/**
 * Cinematic, framed "smoke-and-glass" welcome hero — a dark rounded shell over a
 * volumetric fog light, with a floating constellation of curriculum nodes, a
 * two-tone display headline, glass chips, faint light streaks, and a powered-by
 * cloud. A self-dark `dark` island so its neutral tokens resolve to their light
 * (dark-theme) values in BOTH app themes; the imagery is literal, not `dark:`.
 */

type NodeDatum = {
  label: string;
  value: string;
  glyph: ReactNode;
  /** corner placement */
  pos: "tl" | "tr" | "bl" | "br";
};

function NodeGlyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const GLYPHS = {
  atom: "M12 4c4 0 8 3.6 8 8s-4 8-8 8-8-3.6-8-8 4-8 8-8Zm0 0c-2.6 3-4 6-4 8s1.4 5 4 8m0-16c2.6 3 4 6 4 8s-1.4 5-4 8",
  wave: "M3 12c2.5-5 4.5-5 7 0s4.5 5 7 0",
  branch: "M6 4v6a4 4 0 0 0 4 4h8M18 10l-2 4 2 4",
  target: "M12 3v3m0 12v3m9-9h-3M6 12H3m14.5-6.5-2 2M8 16l-2 2m10 0-2-2M8 8 6 6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
} as const;

function Node({ node }: { node: NodeDatum }) {
  const place: Record<NodeDatum["pos"], string> = {
    tl: "left-[6%] top-[26%] sm:left-[10%]",
    tr: "right-[6%] top-[24%] sm:right-[9%] text-right",
    bl: "left-[7%] bottom-[26%] sm:left-[9%]",
    br: "right-[6%] bottom-[24%] sm:right-[9%] text-right",
  };
  const rightSide = node.pos === "tr" || node.pos === "br";
  return (
    <div className={`pointer-events-none absolute z-20 hidden lg:block ${place[node.pos]}`}>
      <div className={`flex items-center gap-2.5 ${rightSide ? "flex-row-reverse" : ""}`}>
        <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 backdrop-blur-md">
          {node.glyph}
        </span>
        <span className="h-px w-8 bg-gradient-to-r from-white/25 to-transparent" style={rightSide ? { transform: "scaleX(-1)" } : undefined} />
      </div>
      <div className={`mt-2 ${rightSide ? "pr-11 text-right" : "pl-11"}`}>
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-white/85">
          <span className="h-1 w-1 rounded-full bg-accent" />
          {node.label}
        </div>
        <div className="font-mono text-[11px] tracking-wider text-white/40">{node.value}</div>
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
}: {
  eyebrow: string;
  headlineLead: string;
  headlineDim: string;
  subtitle: string;
  ctas: ReactNode;
  stats: { value: number | string; label: string }[];
  nodes: { label: string; value: string; pos: NodeDatum["pos"] }[];
}) {
  const glyphOrder = [GLYPHS.atom, GLYPHS.wave, GLYPHS.branch, GLYPHS.target];
  const nodeData: NodeDatum[] = nodes.map((n, i) => ({
    ...n,
    glyph: <NodeGlyph d={glyphOrder[i % glyphOrder.length]} />,
  }));

  return (
    <section className="dark relative px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="relative isolate overflow-hidden rounded-frame bg-[#0b0b0c] shadow-[0_50px_120px_-45px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06]">
        {/* Volumetric fog light */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, pre-sized WebP */}
        <img
          src="/welcome/hero-fog.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.92]"
        />
        {/* Legibility wash — keep the left/center readable, let the light bloom breathe */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_78%_-10%,transparent_10%,rgba(11,11,12,0.55)_60%,rgba(11,11,12,0.92)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b0c]/40 via-transparent to-[#0b0b0c]" />

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
          <path d="M150 250 C 480 130, 960 130, 1290 300" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
          <path d="M150 560 C 520 700, 940 700, 1300 560" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        </svg>

        {nodeData.map((n) => (
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
            {headlineLead} <span className="text-white/35">{headlineDim}</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/55">{subtitle}</p>

          <div className="mt-9">{ctas}</div>

          <dl className="mt-14 flex items-center gap-8 sm:gap-12">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-2xl font-light text-white tabular-nums">{s.value}</dd>
                <dd className="mt-1 text-xs text-white/45">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Scroll cue — bottom-left glass chip */}
        <a
          href="#curriculum"
          className="absolute bottom-5 left-5 z-20 hidden items-center gap-2.5 rounded-chip border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/60 backdrop-blur-md transition-colors hover:text-white/90 sm:flex"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full border border-white/15">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-5-5m5 5l5-5" />
            </svg>
          </span>
          <span className="font-mono tracking-wide">01 / 03 · Scroll down</span>
        </a>

        {/* Horizons progress — bottom-right */}
        <div className="absolute bottom-6 right-6 z-20 hidden select-none flex-col items-end gap-2 sm:flex">
          <span className="font-mono text-[12px] tracking-wide text-white/55">Quantum horizons</span>
          <div className="flex items-center gap-1">
            <span className="h-1 w-7 rounded-full bg-accent" />
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="h-1 w-7 rounded-full bg-white/12" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
