"use client";

import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { blochVector, type Complex } from "./math";
// Footprint constant only. The cycle (lazy -> dynamic import of this module ->
// static import back) never executes at init: this module is reachable ONLY
// through the wrapper's dynamic import, so the wrapper is always evaluated
// first, and the constant is a plain string with no initialization order risk.
import { SPHERE_BOX } from "./bloch-sphere-3d-lazy";

/**
 * A draggable 3D Bloch sphere for a single-qubit state. The state vector lerps
 * toward its target each frame, so scrubbing through a circuit shows the vector
 * sweeping across the sphere. Physics convention mapped to three.js axes:
 *   Bloch +Z (|0>) -> three +Y (up)
 *   Bloch +X (|+>) -> three +X (right)
 *   Bloch +Y (|i>) -> three +Z (toward viewer)
 *
 * Rendered only when motion is allowed and WebGL is present; the scrubber falls
 * back to the 2D BlochDial otherwise. Mounted lazily (dynamic, ssr:false) so
 * three.js stays out of the main bundle and never runs on the server.
 */

const RING = "#94a3b8"; // slate-400: legible on both themes at low opacity

/** State-vector chase time constant, in seconds. See the useFrame note below. */
const TAU = 0.084;

function blochToThree(state: Complex[]): THREE.Vector3 {
  const { x, y, z } = blochVector(state);
  return new THREE.Vector3(x, z, y);
}

function circlePoints(plane: "equator" | "xz" | "yz", segments = 64): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const a = Math.cos(t);
    const b = Math.sin(t);
    if (plane === "equator") pts.push([a, 0, b]);
    else if (plane === "xz") pts.push([a, b, 0]);
    else pts.push([0, a, b]);
  }
  return pts;
}

// Static ring/axis geometry never depends on state — build once at module load
// instead of reallocating on every Scene render (slider/scrub/scroll ticks).
const EQUATOR_PTS = circlePoints("equator");
const XZ_PTS = circlePoints("xz");
const YZ_PTS = circlePoints("yz");
const AXIS_Y: [number, number, number][] = [
  [0, -1.15, 0],
  [0, 1.15, 0],
];
const AXIS_X: [number, number, number][] = [
  [-1.15, 0, 0],
  [1.15, 0, 0],
];
const AXIS_Z: [number, number, number][] = [
  [0, 0, -1.15],
  [0, 0, 1.15],
];

function StateVector({ target, color }: { target: THREE.Vector3; color: string }) {
  const shaft = useRef<THREE.Group>(null);
  const tip = useRef<THREE.Mesh>(null);
  const current = useRef(new THREE.Vector3(0, 1, 0));
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const invalidate = useThree((s) => s.invalidate);

  // In demand mode, kick a render whenever the target moves (slider/scrub/scroll);
  // the frame loop below then self-sustains until the lerp settles.
  useEffect(() => {
    invalidate();
  }, [target, invalidate]);

  useFrame((_, delta) => {
    // Exponential decay on the frame delta, not a fixed per-frame factor. The
    // sweep IS the teaching here (the vector visibly travels between gates), so
    // it must take the same wall time at 30, 60 and 144Hz; a flat lerp(0.18)
    // converged in frames, i.e. ~2.4x faster on a 144Hz display, degrading
    // toward an instant jump. TAU reproduces the old 60Hz feel exactly:
    // 1 - exp(-(1/60) / 0.084) = 0.180. Matches fog-field's delta-time idiom.
    const k = 1 - Math.exp(-delta / TAU);
    current.current.lerp(target, k);
    const len = current.current.length() || 1e-6;
    dir.copy(current.current).normalize();
    if (shaft.current) {
      shaft.current.quaternion.setFromUnitVectors(up, dir);
      shaft.current.scale.set(1, len, 1);
    }
    if (tip.current) tip.current.position.copy(current.current);
    // Request the next frame only while still converging; idle once settled.
    if (current.current.distanceToSquared(target) > 1e-6) invalidate();
  });

  return (
    <>
      <group ref={shaft}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 1, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
      <mesh ref={tip} position={[0, 1, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </>
  );
}

function Label({
  position,
  children,
}: {
  position: [number, number, number];
  children: React.ReactNode;
}) {
  return (
    <Html position={position} center distanceFactor={6} style={{ pointerEvents: "none" }}>
      <span className="select-none font-mono text-[10px] text-caption">
        {children}
      </span>
    </Html>
  );
}

const KET_LABELS: { pos: [number, number, number]; text: string }[] = [
  { pos: [0, 1.3, 0], text: "|0⟩" }, { pos: [0, -1.3, 0], text: "|1⟩" },
  { pos: [1.32, 0, 0], text: "|+⟩" }, { pos: [-1.32, 0, 0], text: "|−⟩" },
  { pos: [0, 0, 1.32], text: "|i⟩" }, { pos: [0, 0, -1.32], text: "|−i⟩" },
];

const KetLabels = memo(function KetLabels() {
  return <>{KET_LABELS.map((l) => <Label key={l.text} position={l.pos}>{l.text}</Label>)}</>;
});

function Scene({ state, ghost, accent }: { state: Complex[]; ghost?: Complex[]; accent: string }) {
  const target = useMemo(() => blochToThree(state), [state]);
  // The target ghost is static (no lerp): the live vector visibly chases it.
  const ghostPts = useMemo<[number, number, number][] | null>(() => {
    if (!ghost) return null;
    const g = blochToThree(ghost);
    return [
      [0, 0, 0],
      [g.x, g.y, g.z],
    ];
  }, [ghost]);
  const invalidate = useThree((s) => s.invalidate);
  return (
    <>
      {/* faint solid sphere for depth */}
      <mesh>
        <sphereGeometry args={[1, 48, 32]} />
        <meshBasicMaterial color={RING} transparent opacity={0.05} />
      </mesh>
      {/* great circles */}
      <Line points={EQUATOR_PTS} color={RING} lineWidth={1} transparent opacity={0.4} />
      <Line points={XZ_PTS} color={RING} lineWidth={1} transparent opacity={0.25} />
      <Line points={YZ_PTS} color={RING} lineWidth={1} transparent opacity={0.25} />
      {/* axes */}
      <Line points={AXIS_Y} color={RING} lineWidth={1} transparent opacity={0.5} />
      <Line points={AXIS_X} color={RING} lineWidth={1} transparent opacity={0.5} />
      <Line points={AXIS_Z} color={RING} lineWidth={1} transparent opacity={0.5} />

      <KetLabels />

      {/* target ghost — a reticle (wireframe shell + micro-dot core) at the aim
          point, plus a faint solid shaft for direction. Distinct from the live
          vector by FORM (open shell vs solid tip), not just opacity, so it stays
          legible at 180px. No dashed Line here: LineMaterial dashing silently
          renders as all-gap in this stack. */}
      {ghostPts && (
        <>
          <Line points={ghostPts} color={accent} lineWidth={1} transparent opacity={0.3} />
          <mesh position={ghostPts[1]}>
            <sphereGeometry args={[0.09, 12, 8]} />
            <meshBasicMaterial color={accent} wireframe transparent opacity={0.9} />
          </mesh>
          <mesh position={ghostPts[1]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial color={accent} />
          </mesh>
        </>
      )}

      <StateVector target={target} color={accent} />
      <OrbitControls enablePan={false} enableZoom={false} rotateSpeed={0.6} onChange={() => invalidate()} />
    </>
  );
}

// Approximates the light theme's --accent, oklch(0.66 0.1 118). Only reached
// if the probe below throws (no document, no layout); kept in the olive family
// so a failure degrades to an off-by-a-hair vector rather than a foreign hue.
const ACCENT_FALLBACK = "#8d9b51";

function resolveAccent(): string {
  // Resolve the design-token accent color to an rgb string three can parse.
  // Safe to read the DOM during render: this component is client-only (the
  // scrubber mounts it via dynamic(ssr:false)).
  try {
    const probe = document.createElement("span");
    probe.className = "text-accent";
    probe.style.display = "none";
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    return resolved || ACCENT_FALLBACK;
  } catch {
    return ACCENT_FALLBACK;
  }
}

/**
 * The accent as an external store, following use-display-caps' idiom (module
 * scope, useSyncExternalStore, no set-state-in-effect).
 *
 * Why a store at all: before #169 `--color-accent` was a compile-time @theme
 * value identical in both themes, so resolving it once at mount was correct.
 * It is now a runtime per-theme var (light oklch(0.66 0.1 118), dark
 * oklch(0.85 0.11 118)), and none of the five consumers remount on a theme
 * toggle — so a one-shot probe left the vector and target ghost wearing the
 * other theme's olive (~1.6:1 on the light glass) while every surrounding 2D
 * element updated instantly. The class attribute on <html> is the theme
 * signal, so a MutationObserver on it is the actual external system to
 * subscribe to; the resolved color flows in as a prop and R3F's demand loop
 * repaints through the normal re-render.
 *
 * getSnapshot is called on every render of every consumer, so the probe (which
 * appends a node and forces style resolution) is cached and invalidated only
 * when the theme class actually changes.
 */
let accentCache: string | null = null;

function getAccentSnapshot(): string {
  if (accentCache === null) accentCache = resolveAccent();
  return accentCache;
}

function subscribeAccent(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(() => {
    accentCache = null;
    onChange();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getAccentServerSnapshot(): string {
  return ACCENT_FALLBACK;
}

export default function BlochSphere3D({ state, ghost }: { state: Complex[]; ghost?: Complex[] }) {
  const accent = useSyncExternalStore(
    subscribeAccent,
    getAccentSnapshot,
    getAccentServerSnapshot
  );

  return (
    <div
      // Same footprint constant the lazy wrapper's placeholder reserves, so
      // the loading->mounted swap can never shift the layout.
      className={`${SPHERE_BOX} cursor-grab active:cursor-grabbing`}
      aria-hidden="true"
    >
      <Canvas frameloop="demand" camera={{ position: [1.6, 1.2, 2.2], fov: 45 }} dpr={[1, 2]}>
        <Scene state={state} ghost={ghost} accent={accent} />
      </Canvas>
    </div>
  );
}
