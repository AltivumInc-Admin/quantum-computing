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
