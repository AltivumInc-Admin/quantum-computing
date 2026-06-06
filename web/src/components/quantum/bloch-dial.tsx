import { blochVector, type Complex } from "./math";

/**
 * A compact 2D Bloch readout: the single-qubit state projected onto the
 * X (right = |+>) / Z (up = |0>) plane. Used by CircuitLab and as the
 * reduced-motion / no-WebGL fallback for the 3D Bloch sphere.
 */
export function BlochDial({ state }: { state: Complex[] }) {
  const { x, y, z } = blochVector(state);
  const size = 132;
  const c = size / 2;
  const r = 52;
  const px = c + r * x;
  const py = c - r * z;
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
      <circle cx={px} cy={py} r={4} fill={axis} />
      <circle cx={c} cy={c} r={2.5} className="fill-gray-400 dark:fill-gray-500" />
      <text x={c} y={c - r - 4} textAnchor="middle" className="fill-gray-400 text-[9px] font-mono">|0⟩</text>
      <text x={c} y={c + r + 11} textAnchor="middle" className="fill-gray-400 text-[9px] font-mono">|1⟩</text>
      <text x={c + r + 2} y={c + 3} textAnchor="start" className="fill-gray-400 text-[9px] font-mono">|+⟩</text>
      <text x={c - r - 2} y={c + 3} textAnchor="end" className="fill-gray-400 text-[9px] font-mono">|−⟩</text>
    </svg>
  );
}
