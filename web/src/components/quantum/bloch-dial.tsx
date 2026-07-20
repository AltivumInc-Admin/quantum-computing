import { blochVector, zeroState, clamp, type Complex } from "./math";
import { blochVectorSR } from "./format";

/**
 * The dial's ⟨x,y,z⟩ readout as an sr-only span, for the 3D branch: the WebGL
 * sphere replaces the dial with an aria-hidden canvas, so consumers render this
 * beside it to keep the text equivalent AT-visible. Lives here (not in the 3D
 * module) so jsdom tests can exercise it — R3F's Canvas cannot mount in jsdom.
 * Keep it OUTSIDE any aria-live region or every slider tick would announce it.
 */
export function BlochVectorSR({
  state,
  vector,
}: {
  state?: Complex[];
  vector?: { x: number; y: number; z: number };
}) {
  const v = vector ?? blochVector(state ?? zeroState(1));
  return <span className="sr-only">{blochVectorSR(v)}</span>;
}

/**
 * A compact 2D Bloch readout: the single-qubit state projected onto the
 * X (right = |+>) / Z (up = |0>) plane. Used by CircuitLab, the VQE explorer,
 * and as the reduced-motion / no-WebGL fallback for the 3D Bloch sphere.
 *
 * The out-of-plane Y component (|i> = S|+>, |-i>) is encoded as marker depth —
 * the tip grows + brightens toward the viewer (y > 0) and shrinks + dims away
 * (y < 0) — so equatorial-phase states no longer collapse onto the origin and
 * render identically. Accepts either a pure state vector or a precomputed Bloch
 * vector (the latter for mixed reduced states, whose tip sits inside the sphere).
 *
 * `size` (default 132) scales the whole disc; all geometry derives from the
 * 132px reference design, so size={132} is unchanged for existing callers.
 *
 * `ghostVector` (optional) draws a faint dashed target marker in the same
 * projection — the qblochtarget Rep's aim point. Purely decorative inside this
 * role="img" (the widget names the target in text); absent, nothing changes.
 */
export function BlochDial({
  state,
  vector,
  size = 132,
  labelPrefix = "",
  ghostVector,
}: {
  state?: Complex[];
  vector?: { x: number; y: number; z: number };
  size?: number;
  /**
   * Prepended to the accessible name, e.g. "Qubit 0 reduced " — distinguishes
   * side-by-side dials that would otherwise announce identically.
   */
  labelPrefix?: string;
  ghostVector?: { x: number; y: number; z: number };
}) {
  const { x, y, z } = vector ?? blochVector(state ?? zeroState(1));
  const k = size / 132;
  const c = size / 2;
  const r = 52 * k;
  const px = c + r * x;
  const py = c - r * z;
  // Depth cue for the discarded Y axis: radius/opacity scale with y so |i> (y=+1)
  // and |-i> (y=-1) are visibly distinct from each other and from a null/origin tip.
  const yc = clamp(y, -1, 1);
  const markerR = 4 * k * (1 + 0.45 * yc);
  const markerOpacity = 0.55 + 0.45 * ((yc + 1) / 2);
  const fs = 9 * k;
  const axis = "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      // The state-vector line and tip are drawn in currentColor and carry the
      // dial's meaning, so they take WCAG 1.4.11's 3:1 non-text floor: the
      // light theme pairs down to --accent-dark (the raw light --accent is
      // 2.79:1 on --surface-base). Same routing as Bar's marker.
      className="text-accent-dark dark:text-accent shrink-0"
      role="img"
      aria-label={`${labelPrefix}${blochVectorSR({ x, y, z })}`}
    >
      <circle cx={c} cy={c} r={r} className="fill-none stroke-gray-300 dark:stroke-gray-600" strokeWidth={1} />
      <line x1={c} y1={c - r} x2={c} y2={c + r} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
      <line x1={c - r} y1={c} x2={c + r} y2={c} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
      {/* target ghost — dashed, under the live vector so the tip stays on top.
          The ghost gets the SAME Y-depth encoding as the live tip (radius and
          opacity scale with y), otherwise an out-of-plane target like |i⟩ would
          render identically to its antipode |−i⟩ and the dial could show the
          learner visually "on" a target that grades 180° away. */}
      {ghostVector &&
        (() => {
          const gyc = clamp(ghostVector.y, -1, 1);
          return (
            <g opacity={0.3 + 0.3 * ((gyc + 1) / 2)}>
              <line
                x1={c}
                y1={c}
                x2={c + r * ghostVector.x}
                y2={c - r * ghostVector.z}
                stroke={axis}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeDasharray={`${3 * k} ${3 * k}`}
              />
              <circle
                cx={c + r * ghostVector.x}
                cy={c - r * ghostVector.z}
                r={4.5 * k * (1 + 0.45 * gyc)}
                fill="none"
                stroke={axis}
                strokeWidth={1.5}
                strokeDasharray={`${2.5 * k} ${2.5 * k}`}
              />
            </g>
          );
        })()}
      {/* state vector */}
      <line x1={c} y1={c} x2={px} y2={py} stroke={axis} strokeWidth={2} strokeLinecap="round" />
      <circle cx={px} cy={py} r={markerR} fill={axis} opacity={markerOpacity} />
      <circle cx={c} cy={c} r={2.5 * k} className="fill-gray-400 dark:fill-gray-500" />
      {/* Ket axis labels on the caption ink token (--mut, 6.5:1 light /
          6.4:1 dark) — the same tier the 3D sphere's labels already use via
          .text-caption. They were fill-gray-400 with no dark: variant, which
          computes ~2.5:1 on the light glass at this 9-12px size. */}
      <text x={c} y={c - r - 4 * k} textAnchor="middle" fontSize={fs} className="fill-(--mut) font-mono">|0⟩</text>
      <text x={c} y={c + r + 11 * k} textAnchor="middle" fontSize={fs} className="fill-(--mut) font-mono">|1⟩</text>
      <text x={c + r + 2 * k} y={c + 3 * k} textAnchor="start" fontSize={fs} className="fill-(--mut) font-mono">|+⟩</text>
      <text x={c - r - 2 * k} y={c + 3 * k} textAnchor="end" fontSize={fs} className="fill-(--mut) font-mono">|−⟩</text>
    </svg>
  );
}
