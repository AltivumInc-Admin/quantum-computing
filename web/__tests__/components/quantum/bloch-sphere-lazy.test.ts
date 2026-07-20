import { SPHERE_BOX, SPHERE_PX } from "@/components/quantum/bloch-sphere-3d-lazy";

/**
 * The sphere's footprint is one number expressed two ways: SPHERE_PX (the 2D
 * dial fallbacks' `size` prop) and SPHERE_BOX (the Tailwind classes on the
 * canvas wrapper and the lazy-loading placeholder). Tailwind only sees literal
 * class strings, so SPHERE_BOX cannot be interpolated from SPHERE_PX — this
 * pins them to each other instead. A placeholder that disagrees with the canvas
 * is the layout jump WS-B2/#91 fixed.
 */
describe("Bloch sphere footprint", () => {
  it("expresses SPHERE_PX in both dimensions of SPHERE_BOX", () => {
    expect(SPHERE_BOX).toContain(`h-[${SPHERE_PX}px]`);
    expect(SPHERE_BOX).toContain(`w-[${SPHERE_PX}px]`);
  });

  it("keeps the box from shrinking in a flex row", () => {
    expect(SPHERE_BOX).toContain("shrink-0");
  });
});
