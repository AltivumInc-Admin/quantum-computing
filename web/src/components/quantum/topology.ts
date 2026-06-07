export type Topology = "all-to-all" | "line" | "ring" | "grid";

export function adjacency(topo: Topology, n: number): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  const link = (a: number, b: number) => {
    if (a !== b && a < n && b < n && a >= 0 && b >= 0 && !adj[a].includes(b)) {
      adj[a].push(b);
      adj[b].push(a);
    }
  };
  if (topo === "all-to-all") {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) link(i, j);
  } else if (topo === "line") {
    for (let i = 0; i < n - 1; i++) link(i, i + 1);
  } else if (topo === "ring") {
    for (let i = 0; i < n; i++) link(i, (i + 1) % n);
  } else {
    const w = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      if (i % w !== w - 1) link(i, i + 1);
      link(i, i + w);
    }
  }
  return adj;
}

export function shortestPath(adj: number[][], a: number, b: number): number[] | null {
  if (a === b) return [a];
  const prev = new Array<number>(adj.length).fill(-1);
  const seen = new Array<boolean>(adj.length).fill(false);
  const queue = [a];
  seen[a] = true;
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of adj[u]) {
      if (!seen[v]) {
        seen[v] = true;
        prev[v] = u;
        if (v === b) {
          const path = [b];
          for (let x = u; x !== -1; x = prev[x]) path.unshift(x);
          return path;
        }
        queue.push(v);
      }
    }
  }
  return null;
}

export function swapCost(
  topo: Topology,
  n: number,
  a: number,
  b: number
): { path: number[]; swaps: number } {
  const path = shortestPath(adjacency(topo, n), a, b);
  if (!path) return { path: [], swaps: -1 };
  return { path, swaps: Math.max(0, path.length - 2) };
}
