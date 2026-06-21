/**
 * Helpers for the qbloch "Build a state" widget. The state itself is the
 * canonical single-qubit parameterization cos(θ/2)|0> + e^{iφ}sin(θ/2)|1>,
 * single-sourced from math.ts (and shared with the qscrolly explorable).
 */
export { singleQubitState as stateFromAngles } from "./math";

export function probsFromAngles(theta: number): { p0: number; p1: number } {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return { p0: c * c, p1: s * s };
}
