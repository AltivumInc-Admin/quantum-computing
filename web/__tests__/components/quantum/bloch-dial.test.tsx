/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { BlochDial } from "@/components/quantum/bloch-dial";

// The state-vector tip is the only <circle> filled with currentColor.
function tipRadius(container: HTMLElement): number {
  const tip = [...container.querySelectorAll("circle")].find(
    (c) => c.getAttribute("fill") === "currentColor"
  );
  return parseFloat(tip!.getAttribute("r")!);
}

describe("BlochDial Y-axis encoding", () => {
  it("distinguishes |i> (y=+1) from the origin (y=0) — previously both collapsed to the center", () => {
    const ip = render(<BlochDial vector={{ x: 0, y: 1, z: 0 }} />);
    const origin = render(<BlochDial vector={{ x: 0, y: 0, z: 0 }} />);
    expect(tipRadius(ip.container)).toBeGreaterThan(tipRadius(origin.container));
  });

  it("distinguishes |i> (y=+1) from |-i> (y=-1)", () => {
    const ip = render(<BlochDial vector={{ x: 0, y: 1, z: 0 }} />);
    const im = render(<BlochDial vector={{ x: 0, y: -1, z: 0 }} />);
    expect(tipRadius(ip.container)).toBeGreaterThan(tipRadius(im.container));
  });

  it("announces the full Bloch vector including y in the aria-label", () => {
    const { getByLabelText } = render(<BlochDial vector={{ x: 0, y: 1, z: 0 }} />);
    expect(getByLabelText(/y 1\.00/)).toBeInTheDocument();
  });

  it("still accepts a pure state vector (back-compat with CircuitLab usage)", () => {
    const { container } = render(<BlochDial state={[[1, 0], [0, 0]]} />); // |0>
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("BlochDial target ghost", () => {
  it("renders no dashed geometry by default (existing callers unchanged)", () => {
    const { container } = render(<BlochDial vector={{ x: 0, y: 0, z: 1 }} />);
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(0);
  });

  it("draws a dashed ghost line and open marker when ghostVector is set", () => {
    const { container } = render(
      <BlochDial vector={{ x: 0, y: 0, z: 1 }} ghostVector={{ x: 1, y: 0, z: 0 }} />
    );
    const dashed = container.querySelectorAll("[stroke-dasharray]");
    expect(dashed).toHaveLength(2); // shaft line + open-circle tip
    const marker = container.querySelector("circle[stroke-dasharray]")!;
    expect(marker.getAttribute("fill")).toBe("none");
  });

  it("keeps the accessible name pinned to the LIVE vector, not the ghost", () => {
    const { getByLabelText } = render(
      <BlochDial vector={{ x: 0, y: 0, z: 1 }} ghostVector={{ x: 1, y: 0, z: 0 }} />
    );
    expect(getByLabelText(/bloch vector x 0\.00, y 0\.00, z 1\.00/i)).toBeInTheDocument();
  });

  it("gives the ghost the same Y-depth encoding as the live tip (|i> target != |-i> target)", () => {
    const ghostRadius = (container: HTMLElement) =>
      parseFloat(container.querySelector("circle[stroke-dasharray]")!.getAttribute("r")!);
    const toward = render(
      <BlochDial vector={{ x: 0, y: 0, z: 1 }} ghostVector={{ x: 0, y: 1, z: 0 }} />
    );
    const away = render(
      <BlochDial vector={{ x: 0, y: 0, z: 1 }} ghostVector={{ x: 0, y: -1, z: 0 }} />
    );
    expect(ghostRadius(toward.container)).toBeGreaterThan(ghostRadius(away.container));
  });
});
