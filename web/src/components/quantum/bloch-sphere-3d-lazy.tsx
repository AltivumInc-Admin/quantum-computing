"use client";

import dynamic from "next/dynamic";

/**
 * The single lazy entry point for the 3D Bloch sphere.
 *
 * three.js is heavy, so every consumer loads it via `dynamic(ssr:false)` behind
 * a placeholder that reserves the sphere's exact footprint — without it the
 * post-hydration dial->3D flip collapses the layout (the shift WS-B2/#91
 * fixed). That six-line declaration, comment included, was copy-pasted into
 * five files, and the 180px it hard-codes also had to stay in lockstep with the
 * canvas wrapper in bloch-sphere-3d.tsx and the `size={180}` 2D dial fallbacks
 * — seven literals across five files for one number. Owning the dynamic() call,
 * the placeholder and the constant here makes a sphere resize a one-line edit.
 */

/** The sphere's rendered footprint, in CSS pixels. */
export const SPHERE_PX = 180;

/**
 * The footprint as utility classes, for the canvas wrapper, the loading
 * placeholder, and any consumer that needs to match. Tailwind scans literal
 * class strings, so this cannot be interpolated from SPHERE_PX —
 * bloch-sphere-lazy.test.ts pins the two to each other instead.
 */
export const SPHERE_BOX = "h-[180px] w-[180px] shrink-0";

const BlochSphere3D = dynamic(() => import("./bloch-sphere-3d"), {
  ssr: false,
  loading: () => <div className={SPHERE_BOX} aria-hidden="true" />,
});

export default BlochSphere3D;
