"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

/**
 * The "instrument face" welcome hero — a colossal dial rises from below the
 * fold with the curriculum engraved as its bezel: hairline rim circles,
 * machined tick marks, stations 00–06, and the gold hand from the |Q⟩ mark.
 * HUD corner registration marks and telemetry lines frame the face; a mono
 * kicker with a blinking caret leads the display headline, whose dim half
 * sets |0⟩ in gold mono. A self-dark `dark` island over the volumetric fog,
 * so its values are literal (silver hairlines, the dark-theme gold) in BOTH
 * app themes.
 *
 * The dial is a working instrument: selecting a station sweeps the needle to
 * it (a CSS transform transition on the hand group — the reduced-motion
 * override collapses the sweep to a jump) and opens a blurb card in the dial
 * face with the module's summary and an "open section" decision. Stations
 * are focusable controls with aria-expanded; the blurb takes focus when it
 * opens and Escape hands focus back to the station that opened it.
 *
 * Decorative chrome (rim, ticks, hand, HUD, corners) is aria-hidden. The
 * stations render AFTER the heading in DOM order (absolute positioning keeps
 * the visual stack), so assistive tech meets the h1 first and then a
 * coherent "sections on the dial" group — not stray fragments before the
 * page heading.
 *
 * One deliberate deviation from the design kit: its top-left HUD read
 * "QPU live · IQM Garnet". Hardware runs are not currently available
 * (the pricing/credentials copy says so, test-guarded), and the hero must
 * never advertise what the deployed system cannot do — the telemetry line
 * states the in-browser simulator instead, which IS live.
 */

// Dial geometry, in the 1440×780 viewBox the kit authored. The center sits
// 460px below the frame so only the bezel's crest breaches the fold;
// xMidYMax slice pins that crest to the bottom edge at every container size.
const DIAL_CX = 720;
const DIAL_CY = 1240;
const DIAL_R = 640;
// Stations spread across 68° of bezel, first station at -34°.
const STATION_ARC = 68;
const STATION_START = -34;

// Coordinates round to hundredths: Math.sin/cos are not required to be
// correctly rounded, and Node (server render) and the browser (hydration)
// really do differ by an ulp — enough for React to flag every tick as a
// hydration mismatch. 0.01px is far below anything the eye can see.
const dialPt = (r: number, rad: number): [number, number] => [
  Math.round((DIAL_CX + r * Math.sin(rad)) * 100) / 100,
  Math.round((DIAL_CY - r * Math.cos(rad)) * 100) / 100,
];

export type DialSection = {
  slug: string;
  index: number;
  title: string;
  /** One-paragraph module summary for the blurb card. */
  summary: string;
  /** Preformatted, localized "N notebooks" line. */
  countLabel: string;
};

export function WelcomeHero({
  eyebrow,
  headlineLead,
  headlineDimPre,
  headlineDimPost,
  subtitle,
  ctas,
  sections,
  startHere,
  dialLabel,
  hudLive,
  hudCounts,
  microBadges,
  blurbCta,
  blurbClose,
}: {
  eyebrow: string;
  headlineLead: string;
  /** Dim half of the headline, split around the gold mono |0⟩ ket. */
  headlineDimPre: string;
  headlineDimPost: string;
  subtitle: string;
  ctas: ReactNode;
  /** Real curriculum sections — the bezel engraving can never silently lie. */
  sections: DialSection[];
  /** "Start here" flag over station 00. */
  startHere: string;
  /** Accessible name for the station-controls group. */
  dialLabel: string;
  /** Top-left telemetry line (must state something the product really does). */
  hudLive: string;
  /** Top-right telemetry line, derived from the manifest counts. */
  hudCounts: string;
  /** The mono micro-badges under the CTAs ("Free · In-browser · No install"). */
  microBadges: string[];
  /** The blurb's "Open section" CTA label. */
  blurbCta: string;
  /** Accessible name of the blurb's close control. */
  blurbClose: string;
}) {
  const n = sections.length;
  const stations = sections.map((s, i) => ({
    s,
    deg: STATION_START + i * (STATION_ARC / Math.max(1, n - 1)),
  }));

  // The needle rests on station 00 until a station is selected; the blurb
  // only opens on an explicit selection.
  const [selected, setSelected] = useState(0);
  const [blurbOpen, setBlurbOpen] = useState(false);
  const blurbRef = useRef<HTMLDivElement>(null);
  const stationRefs = useRef<(SVGGElement | null)[]>([]);
  const interacted = useRef(false);

  const select = (i: number) => {
    interacted.current = true;
    setSelected(i);
    setBlurbOpen(true);
  };
  const close = () => {
    setBlurbOpen(false);
    stationRefs.current[selected]?.focus();
  };

  // Announce the blurb by moving focus into it when it opens or its station
  // changes — only ever after a real interaction, never on mount.
  useEffect(() => {
    // preventScroll: the readout is already in view beside the plate, and
    // letting focus() scroll would yank the page on shorter viewports.
    if (blurbOpen && interacted.current) blurbRef.current?.focus({ preventScroll: true });
  }, [blurbOpen, selected]);

  // Machined bezel graduations. Minor ticks run on a 1.5° grid; each station
  // then gets a MAJOR tick at its own exact angle rather than the nearest
  // grid line. Snapping majors to the grid is what left the needle pointing
  // beside its graduation instead of at it — 0.67° at station 01 is 7px of
  // arc — and it dropped station 03 entirely, since 0° sits inside the
  // crest band the minors skip. The crest stays clear of MINOR ticks only,
  // so the fog still reads through the rim's apex.
  const MINOR_STEP = 1.5;
  const ticks: { x1: number; y1: number; x2: number; y2: number; major: boolean; key: string }[] = [];
  const push = (a: number, major: boolean, key: string) => {
    const rad = (a * Math.PI) / 180;
    const [x1, y1] = dialPt(DIAL_R, rad);
    const [x2, y2] = dialPt(DIAL_R + (major ? 18 : 8), rad);
    ticks.push({ x1, y1, x2, y2, major, key });
  };
  for (let a = -40; a <= 40; a += MINOR_STEP) {
    if (Math.abs(a) < 7) continue;
    // Leave room around each station so its major tick reads alone.
    if (stations.some((st) => Math.abs(st.deg - a) < MINOR_STEP)) continue;
    push(a, false, `m${a}`);
  }
  for (const st of stations) push(st.deg, true, `s${st.s.slug}`);

  const sel = sections[selected];
  const selShort = sel.title.split(":")[0];

  const hud =
    "pointer-events-none absolute top-11 z-[15] hidden items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[rgba(224,224,224,0.45)] sm:flex";
  const corner =
    "pointer-events-none absolute z-[15] hidden h-[18px] w-[18px] border-[rgba(224,224,224,0.18)] sm:block";

  return (
    <section className="dark relative px-3 pt-3 sm:px-4 sm:pt-4">
      {/* min-height, not padding: the frame's height was content-driven, so the
          shorter English copy left the next section peeking above the fold
          while the longer Spanish copy did not. Sizing against the viewport
          (minus the nav, this section's inset, and the partners strip below)
          makes the hero own the fold in both locales. */}
      <div className="relative isolate min-h-[calc(100svh-10rem)] overflow-hidden rounded-frame bg-abyss shadow-[0_50px_120px_-45px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06]">
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
          className="animate-fog-drift absolute inset-0 h-full w-full object-cover opacity-55"
        />
        {/* Legibility wash — a spine scrim holds the data plate's left ground
            dark while the bloom breathes on the right; the radial keeps the
            frame's depth. Mobile runs text full-width, so the base variant
            spreads the scrim before sm: swaps in the two-layer desktop wash. */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,0.78)_0%,rgba(5,5,5,0.5)_55%,rgba(5,5,5,0.22)_100%)] sm:bg-[linear-gradient(90deg,rgba(5,5,5,0.82)_0%,rgba(5,5,5,0.55)_34%,transparent_62%),radial-gradient(120%_120%_at_78%_-10%,transparent_12%,rgba(5,5,5,0.5)_58%,rgba(5,5,5,0.9)_100%)]" />

        {/* The dial: rim circles, machined ticks, and the gold needle, which
            sweeps to the selected station (transform-box makes the CSS
            rotation pivot on the dial center in viewBox units). Decorative —
            the stations layer below carries the real controls. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 780"
          preserveAspectRatio="xMidYMax slice"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <circle cx={DIAL_CX} cy={DIAL_CY} r={DIAL_R} fill="none" stroke="rgb(224 224 224/.14)" strokeWidth="1.25" pathLength={1} className="animate-path-draw" />
          <circle cx={DIAL_CX} cy={DIAL_CY} r={560} fill="none" stroke="rgb(224 224 224/.07)" strokeWidth="1.25" />
          <circle cx={DIAL_CX} cy={DIAL_CY} r={478} fill="none" stroke="rgb(224 224 224/.045)" strokeWidth="1.25" />
          <g>
            {ticks.map((t) => (
              <line
                key={t.key}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.major ? "rgb(224 224 224/.45)" : "rgb(224 224 224/.28)"}
                strokeWidth={t.major ? 1.5 : 1.25}
              />
            ))}
          </g>
          <g
            className="hidden md:block"
            style={{
              transform: `rotate(${stations[selected].deg}deg)`,
              transformOrigin: `${DIAL_CX}px ${DIAL_CY}px`,
              transformBox: "view-box",
              transition: "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <line x1={DIAL_CX} y1={DIAL_CY} x2={DIAL_CX} y2={DIAL_CY - DIAL_R} stroke="#C2A379" strokeWidth="1.6" pathLength={1} className="animate-path-draw" style={{ animationDelay: "0.9s" }} />
            <circle cx={DIAL_CX} cy={DIAL_CY - DIAL_R} r="3.2" fill="#C2A379" className="animate-signal" />
            <circle cx={DIAL_CX} cy={DIAL_CY - DIAL_R} r="8" fill="none" stroke="#C2A379" strokeOpacity=".35" strokeWidth="1" />
          </g>
        </svg>

        {/* HUD registration corners stay at the FRAME — they register the
            frame itself. Everything that is content — telemetry, the plate,
            the readout — shares one 72rem column aligned with the site nav,
            so on a wide display the readout sits with the composition
            instead of being flung to the far edge. */}
        <div className={`${corner} left-[22px] top-[22px] border-l border-t`} aria-hidden="true" />
        <div className={`${corner} right-[22px] top-[22px] border-r border-t`} aria-hidden="true" />
        <div className={`${corner} bottom-[22px] left-[22px] border-b border-l`} aria-hidden="true" />
        <div className={`${corner} bottom-[22px] right-[22px] border-b border-r`} aria-hidden="true" />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className={`${hud} left-0`} aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C2A379] animate-signal" />
          {hudLive}
          {/* The datum hairline — drops from the telemetry dot to the plate's
              corner, making the left datum the composition's visible spine.
              Anchored to the dot itself so it tracks the column at any width. */}
          <span className="absolute left-[2.5px] top-full h-10 w-px bg-[rgba(224,224,224,0.14)]" />
        </div>
        <div
          className="pointer-events-none absolute right-0 top-11 z-[15] hidden items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[rgba(224,224,224,0.6)] [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] sm:flex"
          aria-hidden="true"
        >
          {hudCounts}
        </div>

        {/* Content — one authored entrance: kicker, headline, subtitle, CTAs,
            micro-badges, each a beat apart. Delays are inline (the codebase
            stagger pattern): the animate-fade-up shorthand would reset a
            class-based delay in the cascade. The bottom padding clears the
            bezel band at every viewport: the crest sits 180/1440 ≈ 12.5% of
            the width above the frame's bottom edge (slice keeps the dial
            width-proportional), so a fixed value can't clear it on wide
            screens — 14vw tracks the crest with a constant margin, and the
            11rem floor keeps narrow layouts from collapsing onto it. */}
        <div className="flex flex-col items-start pb-[max(11rem,14vw)] pt-24 text-left lg:pt-28">
          <span className="animate-fade-up relative inline-flex items-center gap-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#C2A379] sm:text-[11px] sm:tracking-[0.24em]">
            {/* The plate's corner registration, echoing the HUD marks. */}
            <span aria-hidden="true" className="absolute -left-6 -top-3 hidden h-5 w-5 border-l border-t border-[rgba(224,224,224,0.18)] sm:block" />
            {eyebrow}
            <span className="animate-caret inline-block h-3.5 w-[7px] bg-[#C2A379]" aria-hidden="true" />
          </span>

          <h1
            className="animate-fade-up mt-6 mb-5 font-display text-display-2xl font-light tracking-[-0.02em] text-[#F2F2F2]"
            style={{ animationDelay: "90ms" }}
          >
            {headlineLead}
            {/* The dim half is the plate's second engraved line — a block, so
                the break is locale-safe with no authored hyphenation. It
                clears the 3:1 large-text floor over the spine scrim; the ket
                is notation, so it sets in gold MONO, not Sora. */}
            <span className="mt-1 block text-[rgba(242,242,242,0.45)]">
              {headlineDimPre}{" "}
              <code className="font-mono font-light text-[0.92em] tracking-[-0.04em] text-[#C2A379]">
                |0⟩
              </code>{" "}
              {headlineDimPost}
            </span>
          </h1>

          <div className="relative w-full md:pr-[21rem] lg:pr-[23rem]">
          <p
            className="animate-fade-up max-w-[42ch] text-[17px] leading-relaxed text-[rgba(224,224,224,0.62)]"
            style={{ animationDelay: "180ms" }}
          >
            {subtitle}
          </p>

          <div className="animate-fade-up mt-8" style={{ animationDelay: "270ms" }}>
            {ctas}
          </div>

          <div
            className="animate-fade-up relative mt-7 flex w-full max-w-[42ch] flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[rgba(224,224,224,0.4)]"
            style={{ animationDelay: "360ms" }}
          >
            {/* Gold calibration tick where the spec line meets the datum. */}
            <span aria-hidden="true" className="absolute -top-px left-0 h-[2px] w-2 bg-[#C2A379]" />
            {microBadges.map((badge) => (
              <span key={badge} className="flex items-center gap-2.5">
                <span aria-hidden="true" className="h-[3px] w-[3px] bg-[rgba(224,224,224,0.5)]" />
                {badge}
              </span>
            ))}
          </div>

          {/* The blurb — the instrument's readout. It docks to the TOP-RIGHT
              OF THIS BAND rather than a fixed frame offset, so it always
              begins on the subtitle's first line and a headline that grows
              to three or four lines can never collide with it. Clear of the
              dial and needle at every width; a mini gauge (a linear echo of
              the bezel) moves its gold tick in sync with the needle sweep.
              Focus lands here when it opens; Escape returns it to the
              station. md+ with the stations. */}
        {blurbOpen && (
          <div
            ref={blurbRef}
            id="dial-blurb"
            tabIndex={-1}
            role="region"
            aria-label={sel.title}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            className="animate-modal-pop absolute right-0 top-0 z-30 hidden rounded-card border border-white/10 bg-[rgb(11_11_11/0.9)] p-4 text-left shadow-(--shadow-raised) outline-none backdrop-blur-md md:block md:w-[19rem] lg:w-[21rem]"
          >
            <span aria-hidden="true" className="absolute -top-6 right-8 h-6 w-px bg-[rgba(224,224,224,0.25)]" />
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#C2A379]">
                {String(sel.index).padStart(2, "0")} · {selShort}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label={blurbClose}
                className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-white/55 hover:text-white interactive focus-ring"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* One tick per real section; the gold tick tracks the needle
                (duration matches the 0.7s sweep). */}
            <div aria-hidden="true" className="mt-2.5 flex items-end gap-[7px]">
              {sections.map((_, i) => (
                <span key={i} className="relative flex h-3 w-px items-end">
                  <span
                    className={`h-2 w-full transition-colors duration-700 ${
                      i === selected ? "bg-[#C2A379]" : "bg-[rgba(224,224,224,0.35)]"
                    }`}
                  />
                  {i === selected && (
                    <span className="absolute -top-px left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-[#C2A379]" />
                  )}
                </span>
              ))}
            </div>
            <p className="mt-2.5 line-clamp-4 text-[13px] leading-relaxed text-white/75">{sel.summary}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] tabular-nums text-white/45">{sel.countLabel}</span>
              <Link
                href={`/learn/${sel.slug}`}
                className="surface-accent inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-[13px] font-semibold interactive focus-ring"
              >
                {blurbCta}
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
                </svg>
              </Link>
            </div>
          </div>
        )}
          </div>
        </div>


        </div>

        {/* The stations — the curriculum engraved on the bezel, as controls:
            selecting one sweeps the needle to it and opens its blurb. After
            the content in DOM order (see the doc comment); md+ only: the
            slice crop cuts the bezel's flanks on phones, and the curriculum
            grid below carries the same destinations. */}
        <svg
          viewBox="0 0 1440 780"
          preserveAspectRatio="xMidYMax slice"
          role="group"
          aria-label={dialLabel}
          className="absolute inset-0 z-20 hidden h-full w-full md:block"
        >
          {stations.map(({ s, deg }, i) => {
            const rad = (deg * Math.PI) / 180;
            const [lx, ly] = dialPt(DIAL_R - 34, rad);
            // Station 00's flag reads OUTSIDE the bezel. Nudging it "up" in
            // screen space used to drive it straight through the rim, which
            // on this flank descends steeply; placing it radially outward
            // (clear of the 18px major tick) keeps the arc unbroken.
            const [fx, fy] = dialPt(DIAL_R + 54, rad);
            // The bezel engraves the short name ("Prerequisites"); the full
            // manifest title stays the accessible name and tooltip.
            const shortTitle = s.title.split(":")[0];
            return (
              <g
                key={s.slug}
                ref={(el) => {
                  stationRefs.current[i] = el;
                }}
                role="button"
                tabIndex={0}
                aria-label={s.title}
                aria-expanded={blurbOpen && selected === i}
                aria-controls="dial-blurb"
                onClick={() => select(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(i);
                  }
                }}
                style={{ cursor: "pointer", animation: `fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${(0.5 + i * 0.12).toFixed(2)}s both` }}
              >
                <title>{s.title}</title>
                {/* generous transparent hit target */}
                {i === 0 ? (
                  <>
                    <circle className="hidden lg:block" cx={fx} cy={fy - 8} r={22} fill="transparent" />
                    <circle className="lg:hidden" cx={lx} cy={ly - 5} r={22} fill="transparent" />
                  </>
                ) : (
                  <circle cx={lx} cy={ly - 5} r={22} fill="transparent" />
                )}
                {i === 0 ? (
                  <g style={{ pointerEvents: "none" }}>
                    {/* The flag sits outside the bezel, which is also the first
                        thing the dial's `slice` crop eats: below lg it lands
                        off-frame entirely (measured -157px at 768), so there it
                        gives way to the plain numeral every other station uses. */}
                    <g className="hidden lg:block">
                      <text x={fx} y={fy - 14} textAnchor="middle" fill="#C2A379" style={{ font: "500 10px var(--font-mono)", letterSpacing: ".12em", textTransform: "uppercase" }}>
                        {startHere}
                      </text>
                      <text x={fx} y={fy + 4} textAnchor="middle" fill="#F2F2F2" style={{ font: "500 13px var(--font-sans)" }}>
                        {String(s.index).padStart(2, "0")} · {shortTitle}
                      </text>
                    </g>
                    <text className="lg:hidden" x={lx} y={ly} textAnchor="middle" fill={selected === 0 ? "#C2A379" : "rgb(224 224 224/.55)"} style={{ font: "500 12px var(--font-mono)", letterSpacing: ".08em", transition: "fill .3s" }}>
                      {String(s.index).padStart(2, "0")}
                    </text>
                  </g>
                ) : (
                  <text x={lx} y={ly} textAnchor="middle" fill={selected === i ? "#C2A379" : "rgb(224 224 224/.55)"} style={{ font: "500 12px var(--font-mono)", letterSpacing: ".08em", pointerEvents: "none", transition: "fill .3s" }}>
                    {String(s.index).padStart(2, "0")}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

      </div>
    </section>
  );
}
