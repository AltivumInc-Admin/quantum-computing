import { type Complex, cMul, cAbs2, applyGate1InPlace, rx } from "./math";

export type Edge = [number, number];

/**
 * Number of edges whose endpoint bits differ (ordering-invariant). Vertex `i` is
 * bit `i` of the basis-state index (LSB-indexed) — the QaoaExplorer labels its
 * distribution bars in this same vertex order so they line up with the graph.
 */
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

/** Per-basis-state cut values — depends only on the graph, not on (gamma, beta). */
function cutTable(n: number, edges: Edge[]): number[] {
  const cuts = new Array<number>(1 << n);
  for (let x = 0; x < cuts.length; x++) cuts[x] = cutValue(x, edges);
  return cuts;
}

/** QAOA p=1 state from a precomputed cut table: |+>^n -> e^{-i gamma cut(x)} -> RX(2 beta) mixer. */
function stateFromCuts(n: number, cuts: number[], gamma: number, beta: number): Complex[] {
  const N = 1 << n;
  const amp0 = 1 / Math.sqrt(N);
  let state: Complex[] = new Array(N);
  for (let x = 0; x < N; x++) {
    const ph = -gamma * cuts[x];
    state[x] = cMul([amp0, 0], [Math.cos(ph), Math.sin(ph)]);
  }
  for (let q = 0; q < n; q++) state = applyGate1InPlace(state, rx(2 * beta), q, n);
  return state;
}

export function qaoaDistribution(n: number, edges: Edge[], gamma: number, beta: number): number[] {
  return stateFromCuts(n, cutTable(n, edges), gamma, beta).map(cAbs2);
}

/** Expected cut from an already-computed distribution — avoids re-simulating the state. */
export function qaoaExpectedFromDistribution(distribution: number[], edges: Edge[]): number {
  let e = 0;
  for (let x = 0; x < distribution.length; x++) e += distribution[x] * cutValue(x, edges);
  return e;
}

export function qaoaExpectedCut(n: number, edges: Edge[], gamma: number, beta: number): number {
  return qaoaExpectedFromDistribution(qaoaDistribution(n, edges, gamma, beta), edges);
}

/** Expected cut over a res x res grid, gamma in [0, pi], beta in [0, pi/2]. */
export function qaoaLandscape(n: number, edges: Edge[], res: number): number[][] {
  const cuts = cutTable(n, edges); // built once per graph, reused across all cells
  const grid: number[][] = [];
  for (let gi = 0; gi < res; gi++) {
    const gamma = (Math.PI * gi) / (res - 1);
    const row: number[] = [];
    for (let bi = 0; bi < res; bi++) {
      const beta = (Math.PI / 2) * (bi / (res - 1));
      const dist = stateFromCuts(n, cuts, gamma, beta).map(cAbs2);
      let e = 0;
      for (let x = 0; x < dist.length; x++) e += dist[x] * cuts[x];
      row.push(e);
    }
    grid.push(row);
  }
  return grid;
}

export { verticesIn };
