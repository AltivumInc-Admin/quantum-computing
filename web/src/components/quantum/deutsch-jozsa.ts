import { type Complex, H, applyGate1InPlace, cAbs2 } from "./math";

export type Oracle = (x: number) => 0 | 1;

function popcount(x: number): number {
  let c = 0;
  while (x) { c += x & 1; x >>= 1; }
  return c;
}

/**
 * The selectable oracles, each paired with the label the picker shows for it.
 * The label used to live in dj-demo as a SECOND `Record<string, string>` keyed
 * by these same strings and joined only by `??` fallbacks, so adding a fifth
 * oracle here rendered a dropdown option captioned with the raw key ("lowbit")
 * and a typo'd key silently evaluated constant0 instead. One literal makes both
 * of those a type error. `satisfies` keeps the key union literal (see
 * `OracleKey`) while still checking each entry against the shape.
 */
export const ORACLES = {
  constant0: { f: (): 0 => 0, label: "f(x) = 0 (always)" },
  constant1: { f: (): 1 => 1, label: "f(x) = 1 (always)" },
  parity: { f: (x: number) => (popcount(x) % 2) as 0 | 1, label: "f(x) = parity of x" }, // balanced
  lowbit: { f: (x: number) => (x & 1) as 0 | 1, label: "f(x) = lowest bit of x" }, // balanced
} satisfies Record<string, { f: Oracle; label: string }>;

export type OracleKey = keyof typeof ORACLES;

/** Deutsch-Jozsa via phase oracle: H^n, amp_x *= (-1)^f(x), H^n; returns |amp|^2. */
export function djProbabilities(n: number, f: Oracle): number[] {
  if (n > 3) throw new Error("qdj supports up to 3 qubits");
  const N = 1 << n;
  let state: Complex[] = Array.from({ length: N }, () => [0, 0] as Complex);
  state[0] = [1, 0];
  for (let q = 0; q < n; q++) state = applyGate1InPlace(state, H, q, n);
  for (let x = 0; x < N; x++) if (f(x) === 1) state[x] = [-state[x][0], -state[x][1]];
  for (let q = 0; q < n; q++) state = applyGate1InPlace(state, H, q, n);
  return state.map(cAbs2);
}

/** Constant ⇒ all-zeros with certainty; balanced ⇒ never all-zeros. */
export function isConstant(probs: number[]): boolean {
  return probs[0] > 0.5;
}
