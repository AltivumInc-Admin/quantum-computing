/**
 * @jest-environment jsdom
 *
 * The 3D branch of WavefunctionScrubber (see bloch-builder-widget.3d.test.tsx
 * for why this lives in its own file with module-level mocks).
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { WavefunctionScrubber } from "@/components/quantum/wavefunction-scrubber";

jest.mock("@/components/quantum/use-display-caps", () => ({
  usePrefersReducedMotion: () => false,
  useWebGL: () => true,
}));
jest.mock("@/components/quantum/bloch-sphere-3d", () => ({
  __esModule: true,
  default: () => <div data-testid="sphere-3d" />,
}));

describe("WavefunctionScrubber (3D branch)", () => {
  it("keeps the Bloch-vector text equivalent for single-qubit circuits", () => {
    render(<WavefunctionScrubber source="H 0" />);
    // Step 0 = |0>: z=+1.
    expect(screen.getByText(/bloch vector x 0\.00, y 0\.00, z 1\.00/i)).toBeInTheDocument();
  });

  it("updates the sr vector text as the scrubber advances", () => {
    render(<WavefunctionScrubber source="H 0" />);
    fireEvent.change(screen.getByRole("slider", { name: /step/i }), { target: { value: "1" } });
    // After H: on the +X equator.
    expect(screen.getByText(/bloch vector x 1\.00, y 0\.00, z 0\.00/i)).toBeInTheDocument();
  });
});
