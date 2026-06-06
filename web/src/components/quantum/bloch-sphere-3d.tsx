"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { blochVector, type Complex } from "./math";

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

function StateVector({ target, color }: { target: THREE.Vector3; color: string }) {
  const shaft = useRef<THREE.Group>(null);
  const tip = useRef<THREE.Mesh>(null);
  const current = useRef(new THREE.Vector3(0, 1, 0));
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const dir = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    current.current.lerp(target, 0.18);
    const len = current.current.length() || 1e-6;
    dir.copy(current.current).normalize();
    if (shaft.current) {
      shaft.current.quaternion.setFromUnitVectors(up, dir);
      shaft.current.scale.set(1, len, 1);
    }
    if (tip.current) tip.current.position.copy(current.current);
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
      <span className="select-none font-mono text-[10px] text-gray-400 dark:text-gray-500">
        {children}
      </span>
    </Html>
  );
}

function Scene({ state, accent }: { state: Complex[]; accent: string }) {
  const target = useMemo(() => blochToThree(state), [state]);
  return (
    <>
      {/* faint solid sphere for depth */}
      <mesh>
        <sphereGeometry args={[1, 48, 32]} />
        <meshBasicMaterial color={RING} transparent opacity={0.05} />
      </mesh>
      {/* great circles */}
      <Line points={circlePoints("equator")} color={RING} lineWidth={1} transparent opacity={0.4} />
      <Line points={circlePoints("xz")} color={RING} lineWidth={1} transparent opacity={0.25} />
      <Line points={circlePoints("yz")} color={RING} lineWidth={1} transparent opacity={0.25} />
      {/* axes */}
      <Line points={[[0, -1.15, 0], [0, 1.15, 0]]} color={RING} lineWidth={1} transparent opacity={0.5} />
      <Line points={[[-1.15, 0, 0], [1.15, 0, 0]]} color={RING} lineWidth={1} transparent opacity={0.5} />
      <Line points={[[0, 0, -1.15], [0, 0, 1.15]]} color={RING} lineWidth={1} transparent opacity={0.5} />

      <Label position={[0, 1.3, 0]}>|0⟩</Label>
      <Label position={[0, -1.3, 0]}>|1⟩</Label>
      <Label position={[1.32, 0, 0]}>|+⟩</Label>
      <Label position={[-1.32, 0, 0]}>|−⟩</Label>
      <Label position={[0, 0, 1.32]}>|i⟩</Label>
      <Label position={[0, 0, -1.32]}>|−i⟩</Label>

      <StateVector target={target} color={accent} />
      <OrbitControls enablePan={false} enableZoom={false} rotateSpeed={0.6} />
    </>
  );
}

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
    return resolved || "#2cc9d6";
  } catch {
    return "#2cc9d6";
  }
}

export default function BlochSphere3D({ state }: { state: Complex[] }) {
  const [accent] = useState(resolveAccent);

  return (
    <div
      className="h-[180px] w-[180px] shrink-0 cursor-grab active:cursor-grabbing"
      aria-hidden="true"
    >
      <Canvas camera={{ position: [1.6, 1.2, 2.2], fov: 45 }} dpr={[1, 2]}>
        <Scene state={state} accent={accent} />
      </Canvas>
    </div>
  );
}
