import { type Complex } from "./math";
import { angleState, iqpState, fidelity } from "./encoding";
import { mulberry32, gauss, type Point } from "./rng";

export type FeatureMap = "angle" | "iqp";
export type { Point };

export function featureState(x: [number, number], map: FeatureMap, scale: number): Complex[] {
  const a = x[0] * scale, b = x[1] * scale;
  return map === "iqp" ? iqpState(a, b) : angleState(a, b);
}

export function kernelMatrix(points: [number, number][], map: FeatureMap, scale: number): number[][] {
  const states = points.map((p) => featureState(p, map, scale));
  return states.map((si) => states.map((sj) => fidelity(si, sj)));
}

/** Required bias = -mean_j( sum_i y_i K(x_j, x_i) ), centering the decision threshold. */
export function kernelBias(train: Point[], map: FeatureMap, scale: number): number {
  const states = train.map((p) => featureState(p.x, map, scale));
  let total = 0;
  for (let j = 0; j < train.length; j++) {
    let s = 0;
    for (let i = 0; i < train.length; i++) s += train[i].y * fidelity(states[j], states[i]);
    total += s;
  }
  return -total / train.length;
}

export function kernelScore(x: [number, number], train: Point[], map: FeatureMap, scale: number, bias: number): number {
  const sx = featureState(x, map, scale);
  let s = bias;
  for (const p of train) s += p.y * fidelity(sx, featureState(p.x, map, scale));
  return s;
}

/** Like kernelScore but reuses precomputed training feature states (one per train point). */
export function kernelScoreS(x: [number, number], trainStates: Complex[][], train: Point[], map: FeatureMap, scale: number, bias: number): number {
  const sx = featureState(x, map, scale);
  let s = bias;
  for (let i = 0; i < train.length; i++) s += train[i].y * fidelity(sx, trainStates[i]);
  return s;
}

export function accuracy(preds: number[], labels: number[]): number {
  let c = 0;
  for (let i = 0; i < preds.length; i++) if (preds[i] === labels[i]) c++;
  return c / preds.length;
}

export type DatasetName = "circles" | "xor";

export function makeDataset(name: DatasetName, n: number, seed: number): Point[] {
  const rng = mulberry32(seed);
  const pts: Point[] = [];
  if (name === "circles") {
    for (let i = 0; i < n; i++) {
      const inner = i % 2 === 0;
      const r = inner ? rng() * 0.35 : 0.75 + rng() * 0.25;
      const t = rng() * 2 * Math.PI;
      pts.push({ x: [r * Math.cos(t) + 0.08 * gauss(rng), r * Math.sin(t) + 0.08 * gauss(rng)], y: inner ? -1 : 1 });
    }
  } else {
    const centers: [number, number, -1 | 1][] = [[0.6, 0.6, 1], [-0.6, -0.6, 1], [0.6, -0.6, -1], [-0.6, 0.6, -1]];
    for (let i = 0; i < n; i++) {
      const [cx, cy, y] = centers[i % 4];
      pts.push({ x: [cx + 0.1 * gauss(rng), cy + 0.1 * gauss(rng)], y });
    }
  }
  return pts;
}
