/**
 * @jest-environment jsdom
 *
 * The 3D branch of BlochBuilder, exercised by mocking the capability hooks
 * (jsdom has no WebGL) and stubbing the heavy R3F sphere module (its Canvas
 * cannot mount in jsdom). Separate file from bloch-builder-widget.test.tsx:
 * these are module-level mocks and the main file asserts the dial fallback.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { BlochBuilder } from "@/components/quantum/bloch-builder-widget";

jest.mock("@/components/quantum/use-display-caps", () => ({
  usePrefersReducedMotion: () => false,
  useWebGL: () => true,
}));
jest.mock("@/components/quantum/bloch-sphere-3d", () => ({
  __esModule: true,
  default: () => <div data-testid="sphere-3d" />,
}));

describe("BlochBuilder (3D branch)", () => {
  it("keeps the Bloch-vector text equivalent when the sphere replaces the dial", () => {
    render(<BlochBuilder />);
    // theta=pi/2, phi=0 -> x=1: same string the dial's aria-label carries.
    expect(screen.getByText(/bloch vector x 1\.00, y 0\.00, z 0\.00/i)).toBeInTheDocument();
  });

  it("keeps the sr readout outside the live region (no per-tick announcements)", () => {
    const { container } = render(<BlochBuilder />);
    const sr = screen.getByText(/bloch vector/i);
    expect(sr.closest('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toContainElement(sr);
  });
});
