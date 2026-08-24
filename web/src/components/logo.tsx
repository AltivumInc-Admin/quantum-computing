/* The |Q⟩ mark — the dial-Q. Notation strokes (bar + angle bracket) in the
   surrounding ink via currentColor; the Q is a gold dial whose hand sweeps
   from the hub — a state, read out. Mirrors the design system's commissioned
   Logo component: token-driven gold (var(--accent) — dial gold on daylight,
   bright gold after dark) and size-adaptive machining — below 26px the
   strokes step up to the app-icon weights (2.6/1.8) so the mark stays
   legible at favicon scales; at 26px+ it wears the fine 1.9/1.5 hairlines.
   tone="mono" renders everything in currentColor for one-ink contexts.
   Clear space is the bar's height; don't redraw, recolor, or add orbits. */
export function LogoMark({
  className,
  tone = "gold",
  size = 28,
  label,
}: {
  className?: string;
  tone?: "gold" | "mono";
  size?: number;
  /** Accessible name for a standalone mark; omit where a labelled parent
      (nav link, heading) already names it and the mark is decorative. */
  label?: string;
}) {
  const w = size < 26 ? 2.6 : 1.9;
  const hub = size < 26 ? 1.8 : 1.5;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      className={className}
    >
      <path d="M9 17V47" stroke="currentColor" strokeWidth={w} />
      <g className={tone === "gold" ? "text-accent" : undefined}>
        <circle cx="30.5" cy="32" r="12.5" stroke="currentColor" strokeWidth={w} />
        <path d="M36.7 38.2 42.6 44.1" stroke="currentColor" strokeWidth={w} />
        <circle cx="30.5" cy="32" r={hub} fill="currentColor" />
      </g>
      <path d="M48.5 17 57 32 48.5 47" stroke="currentColor" strokeWidth={w} strokeLinejoin="miter" />
    </svg>
  );
}
