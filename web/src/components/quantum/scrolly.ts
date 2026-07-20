/**
 * Pure model for the `qscrolly` scroll-driven explorable. A lesson supplies a
 * sequence of "beats" — each a caption plus the single-qubit state it describes,
 * given as a Bloch rotation (theta about Y, optional phi about Z). As the reader
 * scrolls, the sticky Bloch sphere shows the state interpolated between the two
 * surrounding beats, so a concept unfolds continuously rather than jumping.
 *
 * Everything here is pure and built on the math.ts kernel, so it is fully
 * unit-testable with closed-form Bloch-vector assertions and runs identically on
 * the server (for the static fallback) and the client.
 */

import { clamp, singleQubitState, type Complex } from "./math";

export interface Beat {
  /** Prose shown beside the sphere while this beat is active. */
  caption: string;
  /** Polar angle: rotation about Y applied to |0>. 0 = |0> (north), PI = |1>. */
  theta: number;
  /** Optional azimuthal angle: rotation about Z (relative phase). Default 0. */
  phi?: number;
}

export interface ScrollySpec {
  beats: Beat[];
}

export interface ParsedScrolly {
  spec?: ScrollySpec;
  error?: string;
}

export function parseScrolly(source: string): ParsedScrolly {
  try {
    const data = JSON.parse(source) as { beats?: unknown };
    if (!data || !Array.isArray(data.beats)) {
      throw new Error('expected a { "beats": [ ... ] } object');
    }
    if (data.beats.length < 2) {
      throw new Error("a scrolly needs at least two beats");
    }
    data.beats.forEach((b, i) => {
      const beat = b as Partial<Beat>;
      if (typeof beat.caption !== "string") {
        throw new Error(`beat ${i + 1} needs a string "caption"`);
      }
      if (typeof beat.theta !== "number" || !Number.isFinite(beat.theta)) {
        throw new Error(`beat ${i + 1} needs a numeric "theta"`);
      }
      // Finiteness mirrors the theta guard above. JSON.parse maps an
      // overflowing literal (1e999) to Infinity, which is typeof "number" —
      // it would lerp into stateForAngles, make Math.cos/sin NaN, and leave a
      // silently vanished state vector plus an "x NaN, y NaN, z NaN" sr
      // readout instead of this widget's usual loud error card.
      if (
        beat.phi !== undefined &&
        (typeof beat.phi !== "number" || !Number.isFinite(beat.phi))
      ) {
        throw new Error(`beat ${i + 1} "phi" must be a number`);
      }
    });
    return { spec: { beats: data.beats as Beat[] } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** The single-qubit state for a (theta, phi) — canonical, shared with qbloch. */
export function stateForAngles(theta: number, phi: number = 0): Complex[] {
  return singleQubitState(theta, phi);
}

export function stateForBeat(beat: Beat): Complex[] {
  return stateForAngles(beat.theta, beat.phi ?? 0);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * State at a global scroll progress in [0, 1], interpolating the rotation angles
 * between the two surrounding beats. progress 0 yields the first beat's state,
 * progress 1 the last beat's.
 */
export function interpolateState(beats: Beat[], progress01: number): Complex[] {
  const p = clamp(progress01, 0, 1);
  const last = beats.length - 1;
  const pos = p * last;
  const i = Math.min(last - 1, Math.floor(pos));
  const frac = pos - i;
  const a = beats[i];
  const b = beats[i + 1] ?? a;
  const theta = lerp(a.theta, b.theta, frac);
  const phi = lerp(a.phi ?? 0, b.phi ?? 0, frac);
  return stateForAngles(theta, phi);
}

/** Index of the beat whose caption should be highlighted at a given progress. */
export function activeBeatIndex(beats: Beat[], progress01: number): number {
  const p = clamp(progress01, 0, 1);
  return Math.round(p * (beats.length - 1));
}
