import type { Complex } from "./math";

/** Canonical single-qubit state for Bloch angles: cos(θ/2)|0> + e^{iφ} sin(θ/2)|1> (no global phase). */
export function stateFromAngles(theta: number, phi: number): Complex[] {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [
    [c, 0],
    [s * Math.cos(phi), s * Math.sin(phi)],
  ];
}

export function probsFromAngles(theta: number, phi: number): { p0: number; p1: number } {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return { p0: c * c, p1: s * s };
}
