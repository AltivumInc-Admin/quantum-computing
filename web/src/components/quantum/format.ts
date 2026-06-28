export function formatFixed(v: number, digits: number): string {
  const eps = 0.5 * Math.pow(10, -digits);
  return (Math.abs(v) < eps ? 0 : v).toFixed(digits);
}
export const formatHartree = (v: number, digits = 4) => `${formatFixed(v, digits)} Ha`;
export const hartreeSR = (v: number, digits = 4) => `${formatFixed(v, digits)} hartree`;
export const formatAngstrom = (v: number, digits = 2) => `${formatFixed(v, digits)} Å`;
export const angstromSR = (v: number, digits = 2) => `${formatFixed(v, digits)} angstrom`;
export const formatRadians = (v: number, digits = 2) => `${formatFixed(v, digits)} rad`;
// Percentage formatters take an ALREADY-SCALED value (0..100) so the `* 100`
// fraction->percent conversion stays explicit at the call site. formatFixed
// snaps near-zero/-0 to 0, so a noisy "-0.0%" renders as "0.0%".
export const formatPercent = (pct: number, digits = 1) => `${formatFixed(pct, digits)}%`;
export const percentSR = (pct: number, digits = 1) => `${formatFixed(pct, digits)} percent`;
