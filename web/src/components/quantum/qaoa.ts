import { type Complex, cMul, cAbs2, applyGate1, rx } from "./math";

export type Edge = [number, number];

/** Number of edges whose endpoint bits differ (ordering-invariant). */
export function cutValue(x: number, edges: Edge[]): number {
  let c = 0;
  for (const [i, j] of edges) if (((x >> i) & 1) !== ((x >> j) & 1)) c++;
  return c;
}

function verticesIn(edges: Edge[]): number {
  let max = 0;
  for (const [i, j] of edges) max = Math.max(max, i, j);
  return max + 1;
}

/** QAOA p=1 state: |+>^n -> cost-phase e^{-i gamma cut(x)} -> mixer RX(2 beta) on every qubit. */
function qaoaState(n: number, edges: Edge[], gamma: number, beta: number): Complex[] {
  const N = 1 << n;
  const amp0 = 1 / Math.sqrt(N);
  let state: Complex[] = new Array(N);
  for (let x = 0; x < N; x++) {
    const ph = -gamma * cutValue(x, edges);
    state[x] = cMul([amp0, 0], [Math.cos(ph), Math.sin(ph)]);
  }
  for (let q = 0; q < n; q++) state = applyGate1(state, rx(2 * beta), q, n);
  return state;
}

export function qaoaDistribution(n: number, edges: Edge[], gamma: number, beta: number): number[] {
  return qaoaState(n, edges, gamma, beta).map(cAbs2);
}

export function qaoaExpectedCut(n: number, edges: Edge[], gamma: number, beta: number): number {
  const probs = qaoaDistribution(n, edges, gamma, beta);
  let e = 0;
  for (let x = 0; x < probs.length; x++) e += probs[x] * cutValue(x, edges);
  return e;
}

/** Expected cut over a res x res grid, gamma in [0, pi], beta in [0, pi/2]. */
export function qaoaLandscape(n: number, edges: Edge[], res: number): number[][] {
  const grid: number[][] = [];
  for (let gi = 0; gi < res; gi++) {
    const gamma = (Math.PI * gi) / (res - 1);
    const row: number[] = [];
    for (let bi = 0; bi < res; bi++) {
      const beta = (Math.PI / 2) * (bi / (res - 1));
      row.push(qaoaExpectedCut(n, edges, gamma, beta));
    }
    grid.push(row);
  }
  return grid;
}

export { verticesIn };
