"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ErrorCard as SharedErrorCard } from "./widget-ui";
import { BlochDial } from "./bloch-dial";
import {
  energy1q,
  exactGround,
  h2OneQubit,
  oneQubitHamiltonian,
  vqeGradientDescent,
} from "./chemistry";
import { H2 } from "./h2-data";
import { usePrefersReducedMotion } from "./use-display-caps";

/**
 * Inline single-qubit VQE energy-landscape explorer rendered from a ```qvqe
 * fenced block. Parses `{ "R": 0.75 }` defensively (empty -> equilibrium bond
 * length), linearly interpolates the tapered H2 STO-3G coefficients {c0,cz,cx}
 * at R via h2OneQubit, and plots the variational energy E(theta) = c0 + cz
 * cos(theta) + cx sin(theta) of the RY(theta) ansatz as a smooth sinusoid in an
 * SVG. A theta slider drives a moving marker on the curve and a small Bloch
 * indicator in the X-Z plane; a horizontal "variational floor" line marks the
 * exact ground energy (= c0 - hypot(cz, cx)). The Optimize button runs
 * parameter-shift gradient descent from the current theta and animates theta
 * down its history to the floor (reduced motion -> jump to final). The floor
 * coincides with the exact ground energy ONLY because the 1-qubit ansatz is
 * exact for tapered H2 — not a general VQE guarantee. Pure client, no SSR/AWS.
 */

const SVG = { w: 280, h: 170, padX: 10, padY: 14 };
const CURVE_RES = 96; // samples across theta in [-pi, pi]
const OPT_LR = 0.35;
const OPT_STEPS = 40;
const ANIM_MS = 32; // per-frame delay while animating the optimizer trace

const TAU = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

type ParseResult =
  | { ok: true; R: number }
  | { ok: false; error: string };

function parseSource(source: string): ParseResult {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return { ok: true, R: H2.equilibrium.R };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const rawR = obj["R"];
  if (rawR === undefined) {
    return { ok: true, R: H2.equilibrium.R };
  }
  if (typeof rawR !== "number" || !Number.isFinite(rawR)) {
    return { ok: false, error: '"R" must be a finite number (angstrom)' };
  }
  const first = H2.points[0];
  const last = H2.points[H2.points.length - 1];
  if (rawR < first.R || rawR > last.R) {
    return {
      ok: false,
      error: `"R" must be within [${first.R}, ${last.R}] angstrom`,
    };
  }
  return { ok: true, R: rawR };
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message }: { message: string }) {
  return <SharedErrorCard label="qvqe" message={message} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VqeExplorer({ source }: { source: string }) {
  const parsed = useMemo(() => parseSource(source), [source]);

  const [theta, setTheta] = useState(0.4);
  const [optimizing, setOptimizing] = useState(false);
  const thetaId = useId();
  const reducedMotion = usePrefersReducedMotion();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Coefficients + floor depend only on the parsed R, so memoize on parse.
  const model = useMemo(() => {
    if (!parsed.ok) return null;
    const { c0, cz, cx } = h2OneQubit(parsed.R, H2.points);
    const H = oneQubitHamiltonian(c0, cz, cx);
    const floor = exactGround(H).energy; // = c0 - hypot(cz, cx)
    let eMin = Infinity;
    let eMax = -Infinity;
    const samples: { theta: number; energy: number }[] = [];
    for (let i = 0; i < CURVE_RES; i++) {
      const th = -Math.PI + (TAU * i) / (CURVE_RES - 1);
      const e = energy1q(c0, cz, cx, th);
      samples.push({ theta: th, energy: e });
      if (e < eMin) eMin = e;
      if (e > eMax) eMax = e;
    }
    return { c0, cz, cx, H, floor, samples, eMin, eMax };
  }, [parsed]);

  if (!parsed.ok || !model) {
    return <ErrorCard message={parsed.ok ? "no model" : parsed.error} />;
  }

  const { c0, cz, cx, H, floor, samples, eMin, eMax } = model;
  const R = parsed.R;

  const energy = energy1q(c0, cz, cx, theta);
  const aboveFloor = energy - floor;

  // Ansatz state in the X-Z plane: <Z> = cos(theta), <X> = sin(theta).
  const expZ = Math.cos(theta);
  const expX = Math.sin(theta);

  // Plot geometry: theta on x, energy on y (inverted, lower = nearer the floor).
  const span = Math.max(1e-9, eMax - eMin);
  const plotW = SVG.w - 2 * SVG.padX;
  const plotH = SVG.h - 2 * SVG.padY;
  const thetaToX = (th: number) => SVG.padX + ((th + Math.PI) / TAU) * plotW;
  const energyToY = (e: number) =>
    SVG.padY + ((e - eMin) / span) * plotH;

  const curvePath = samples
    .map((s, i) => {
      const x = thetaToX(s.theta);
      const y = energyToY(s.energy);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const markerX = thetaToX(theta);
  const markerY = energyToY(energy);
  const floorY = energyToY(floor);

  const stopAnimation = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onOptimize = () => {
    stopAnimation();
    const result = vqeGradientDescent(H, [theta], OPT_LR, OPT_STEPS);
    // Gradient descent returns an unbounded angle; wrap it into the plotted/slider
    // domain [-pi, pi]. E(theta) is 2*pi-periodic, so the wrapped angle has the
    // identical energy but keeps the marker on the curve and the slider thumb in sync.
    const finalTheta = Math.atan2(Math.sin(result.theta[0]), Math.cos(result.theta[0]));

    if (reducedMotion) {
      setTheta(finalTheta);
      setOptimizing(false);
      return;
    }

    // Animate theta along a smooth descent toward the optimum. The optimizer's
    // history is the energy trace; we ease theta from its current value to the
    // converged angle so the marker visibly slides down to the floor.
    const start = theta;
    const frames = OPT_STEPS;
    setOptimizing(true);
    let frame = 0;
    const tick = () => {
      frame += 1;
      const t = frame / frames;
      const next = start + (finalTheta - start) * t;
      setTheta(next);
      if (frame < frames) {
        timerRef.current = setTimeout(tick, ANIM_MS);
      } else {
        setTheta(finalTheta);
        setOptimizing(false);
        timerRef.current = null;
      }
    };
    timerRef.current = setTimeout(tick, ANIM_MS);
  };

  const onReset = () => {
    stopAnimation();
    setOptimizing(false);
    setTheta(0.4);
  };

  const curveAria = `Variational energy E(theta) for tapered H2 at bond length ${R.toFixed(
    2
  )} angstrom. Current angle ${theta.toFixed(2)} radians gives ${energy.toFixed(
    4
  )} hartree, ${aboveFloor.toFixed(4)} hartree above the exact ground floor ${floor.toFixed(
    4
  )} hartree.`;

  return (
    <div className="not-prose my-6 rounded-card border border-gray-200/80 dark:border-gray-700/40 bg-white dark:bg-[color-mix(in_oklab,var(--surface-1)_60%,transparent)] shadow-(--shadow-resting) overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-accent dark:text-accent-light">
          VQE energy landscape
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          1q ansatz
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          STO-3G
        </span>
        <span className="rounded-chip bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-300">
          R = {R.toFixed(2)} &#8491;
        </span>
      </div>

      <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
        {/* Landscape plot + Bloch indicator */}
        <div className="flex flex-col gap-4">
          <div>
            <svg
              viewBox={`0 0 ${SVG.w} ${SVG.h}`}
              width={SVG.w}
              height={SVG.h}
              role="img"
              aria-label={curveAria}
              className="w-full max-w-[280px] mx-auto block rounded-control"
            >
              <rect
                x={0}
                y={0}
                width={SVG.w}
                height={SVG.h}
                className="fill-gray-50 dark:fill-gray-900/40"
                rx={6}
                aria-hidden="true"
              />
              {/* variational floor (exact ground energy) */}
              <line
                x1={SVG.padX}
                y1={floorY}
                x2={SVG.w - SVG.padX}
                y2={floorY}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="3 3"
                className="text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <text
                x={SVG.w - SVG.padX}
                y={floorY - 4}
                textAnchor="end"
                fontSize={8}
                className="fill-emerald-700 dark:fill-emerald-300 font-mono"
                aria-hidden="true"
              >
                floor {floor.toFixed(3)} Ha
              </text>
              {/* energy curve */}
              <path
                d={curvePath}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinejoin="round"
                className="text-accent dark:text-accent-light"
                aria-hidden="true"
              />
              {/* drop line from marker to floor */}
              <line
                x1={markerX}
                y1={markerY}
                x2={markerX}
                y2={floorY}
                stroke="currentColor"
                strokeWidth={0.8}
                className="text-gray-400 dark:text-gray-500 transition-[x1,x2,y1] duration-150 motion-reduce:transition-none"
                aria-hidden="true"
              />
              {/* moving marker dot at current theta */}
              <circle
                cx={markerX}
                cy={markerY}
                r={3.4}
                className="fill-accent dark:fill-accent-light stroke-white dark:stroke-gray-900 transition-[cx,cy] duration-150 motion-reduce:transition-none"
                strokeWidth={1.4}
                aria-hidden="true"
              />
            </svg>
            <p className="mt-1 text-center text-[10px] text-gray-400 dark:text-gray-500 font-mono">
              E(&#952;) over &#952; &isin; [-&#960;, &#960;]
            </p>
          </div>

          {/* Bloch indicator (X-Z plane) */}
          <div className="flex items-center gap-3">
            <BlochDial vector={{ x: expX, y: 0, z: expZ }} size={86} />
            <p className="text-[10px] leading-relaxed text-gray-500 dark:text-gray-400 font-mono tabular-nums">
              &#10216;Z&#10217; = {expZ.toFixed(3)}
              <br />
              &#10216;X&#10217; = {expX.toFixed(3)}
            </p>
          </div>
        </div>

        {/* Controls + readout */}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm tabular-nums text-gray-800 dark:text-gray-100">
            {"E = "}
            <span className="font-semibold text-accent dark:text-accent-light">
              {energy.toFixed(4)} Ha
            </span>
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            floor {floor.toFixed(4)} Ha &middot; gap {aboveFloor.toFixed(4)} Ha
          </p>

          {/* theta slider */}
          <div className="mt-4 flex items-center gap-3">
            <label
              htmlFor={thetaId}
              className="w-6 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-300"
            >
              &#952;
            </label>
            <input
              id={thetaId}
              type="range"
              min={-Math.PI}
              max={Math.PI}
              step={Math.PI / 90}
              value={theta}
              onChange={(e) => {
                stopAnimation();
                setOptimizing(false);
                setTheta(parseFloat(e.target.value));
              }}
              className="slider flex-1 focus-ring"
              aria-label="Ansatz angle theta in radians"
              aria-valuetext={`${theta.toFixed(2)} radians, energy ${energy.toFixed(
                4
              )} hartree`}
            />
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {theta.toFixed(2)}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOptimize}
              disabled={optimizing}
              className="rounded-control bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-(--shadow-resting) hover:bg-accent-dark focus-ring transition-colors motion-reduce:transition-none disabled:opacity-60"
            >
              {optimizing ? "Optimizing…" : "Optimize"}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-control border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus-ring transition-colors motion-reduce:transition-none"
            >
              Reset
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Optimize runs parameter-shift gradient descent from the current
            angle and slides &#952; down to the variational floor. Here the floor
            equals the <strong>exact</strong> ground energy only because the
            1-qubit ansatz is exact for tapered H<sub>2</sub> (STO-3G); in
            general VQE need not reach the exact energy. Energies in hartree.
          </p>
        </div>
      </div>
    </div>
  );
}
