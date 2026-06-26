export function formatFixed(v: number, digits: number): string {
  const eps = 0.5 * Math.pow(10, -digits);
  return (Math.abs(v) < eps ? 0 : v).toFixed(digits);
}
export const formatHartree = (v: number, digits = 4) => `${formatFixed(v, digits)} Ha`;
export const hartreeSR = (v: number, digits = 4) => `${formatFixed(v, digits)} hartree`;
export const formatAngstrom = (v: number, digits = 2) => `${formatFixed(v, digits)} Å`;
export const angstromSR = (v: number, digits = 2) => `${formatFixed(v, digits)} angstrom`;
export const formatRadians = (v: number, digits = 2) => `${formatFixed(v, digits)} rad`;
