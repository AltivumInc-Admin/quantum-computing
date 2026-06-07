import { type Complex, H, applyGate1, cAbs2 } from "./math";

export type Oracle = (x: number) => 0 | 1;

function popcount(x: number): number {
  let c = 0;
  while (x) { c += x & 1; x >>= 1; }
  return c;
}

export const ORACLES: Record<string, Oracle> = {
  constant0: () => 0,
  constant1: () => 1,
  parity: (x) => (popcount(x) % 2) as 0 | 1, // balanced
  lowbit: (x) => (x & 1) as 0 | 1, // balanced
};

/** Deutsch-Jozsa via phase oracle: H^n, amp_x *= (-1)^f(x), H^n; returns |amp|^2. */
export function djProbabilities(n: number, f: Oracle): number[] {
  if (n > 3) throw new Error("qdj supports up to 3 qubits");
  const N = 1 << n;
  let state: Complex[] = Array.from({ length: N }, () => [0, 0] as Complex);
  state[0] = [1, 0];
  for (let q = 0; q < n; q++) state = applyGate1(state, H, q, n);
  for (let x = 0; x < N; x++) if (f(x) === 1) state[x] = [-state[x][0], -state[x][1]];
  for (let q = 0; q < n; q++) state = applyGate1(state, H, q, n);
  return state.map(cAbs2);
}

/** Constant ⇒ all-zeros with certainty; balanced ⇒ never all-zeros. */
export function isConstant(probs: number[]): boolean {
  return probs[0] > 0.5;
}
