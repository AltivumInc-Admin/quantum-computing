import { blochVector, zeroState, clamp, type Complex } from "./math";

/**
 * A compact 2D Bloch readout: the single-qubit state projected onto the
 * X (right = |+>) / Z (up = |0>) plane. Used by CircuitLab and as the
 * reduced-motion / no-WebGL fallback for the 3D Bloch sphere.
 *
 * The out-of-plane Y component (|i> = S|+>, |-i>) is encoded as marker depth —
 * the tip grows + brightens toward the viewer (y > 0) and shrinks + dims away
 * (y < 0) — so equatorial-phase states no longer collapse onto the origin and
 * render identically. Accepts either a pure state vector or a precomputed Bloch
 * vector (the latter for mixed reduced states, whose tip sits inside the sphere).
 */
export function BlochDial({
  state,
  vector,
}: {
  state?: Complex[];
  vector?: { x: number; y: number; z: number };
}) {
  const { x, y, z } = vector ?? blochVector(state ?? zeroState(1));
  const size = 132;
  const c = size / 2;
  const r = 52;
  const px = c + r * x;
  const py = c - r * z;
  // Depth cue for the discarded Y axis: radius/opacity scale with y so |i> (y=+1)
  // and |-i> (y=-1) are visibly distinct from each other and from a null/origin tip.
  const yc = clamp(y, -1, 1);
  const markerR = 4 * (1 + 0.45 * yc);
  const markerOpacity = 0.55 + 0.45 * ((yc + 1) / 2);
  const axis = "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="text-accent shrink-0"
      role="img"
      aria-label={`Bloch vector x ${x.toFixed(2)}, y ${y.toFixed(2)}, z ${z.toFixed(2)}`}
    >
      <circle cx={c} cy={c} r={r} className="fill-none stroke-gray-300 dark:stroke-gray-600" strokeWidth={1} />
      <line x1={c} y1={c - r} x2={c} y2={c + r} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
      <line x1={c - r} y1={c} x2={c + r} y2={c} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
      {/* state vector */}
      <line x1={c} y1={c} x2={px} y2={py} stroke={axis} strokeWidth={2} strokeLinecap="round" />
      <circle cx={px} cy={py} r={markerR} fill={axis} opacity={markerOpacity} />
      <circle cx={c} cy={c} r={2.5} className="fill-gray-400 dark:fill-gray-500" />
      <text x={c} y={c - r - 4} textAnchor="middle" className="fill-gray-400 text-[9px] font-mono">|0⟩</text>
      <text x={c} y={c + r + 11} textAnchor="middle" className="fill-gray-400 text-[9px] font-mono">|1⟩</text>
      <text x={c + r + 2} y={c + 3} textAnchor="start" className="fill-gray-400 text-[9px] font-mono">|+⟩</text>
      <text x={c - r - 2} y={c + 3} textAnchor="end" className="fill-gray-400 text-[9px] font-mono">|−⟩</text>
    </svg>
  );
}
