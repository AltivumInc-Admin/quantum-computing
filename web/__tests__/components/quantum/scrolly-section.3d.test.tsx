/**
 * @jest-environment jsdom
 *
 * The Explorable (3D) branch of ScrollySection (see
 * bloch-builder-widget.3d.test.tsx for the mock rationale). The scroll
 * choreography stays at beat 0 here — jsdom zeroes getBoundingClientRect, so
 * progress never advances; we only assert the AT-visible vector readout
 * beside the aria-hidden canvas.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ScrollySection } from "@/components/quantum/scrolly-section";

jest.mock("@/components/quantum/use-display-caps", () => ({
  usePrefersReducedMotion: () => false,
  useWebGL: () => true,
}));
jest.mock("@/components/quantum/bloch-sphere-3d", () => ({
  __esModule: true,
  default: () => <div data-testid="sphere-3d" />,
}));

const SOURCE = JSON.stringify({
  beats: [{ caption: "Ground state.", theta: 0 }, { caption: "Equator.", theta: Math.PI / 2 }],
});

describe("ScrollySection (Explorable 3D branch)", () => {
  it("keeps the Bloch-vector text equivalent beside the sphere", () => {
    render(<ScrollySection source={SOURCE} />);
    // First beat theta=0 -> |0>: z=+1.
    expect(screen.getByText(/bloch vector x 0\.00, y 0\.00, z 1\.00/i)).toBeInTheDocument();
  });

  it("keeps the sr readout outside the aria-live beat column", () => {
    render(<ScrollySection source={SOURCE} />);
    expect(screen.getByText(/bloch vector/i).closest('[aria-live]')).toBeNull();
  });
});
