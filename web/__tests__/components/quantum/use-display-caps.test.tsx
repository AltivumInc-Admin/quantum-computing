/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { useWebGL, usePrefersReducedMotion } from "@/components/quantum/use-display-caps";

// useSyncExternalStore calls getSnapshot on every render of every consumer, so a
// naive getSnapshot that probes WebGL / constructs a MediaQueryList would do so
// per render. These tests pin the module-scope memoization: the probe runs at
// most once across many renders. (Each hook is exercised in exactly one test so
// the module cache count is unambiguous.)

describe("use-display-caps memoization", () => {
  it("probes WebGL (canvas + GL context) at most once across many renders", () => {
    const createElementSpy = jest.spyOn(document, "createElement");

    function Probe() {
      return <span data-testid="webgl">{String(useWebGL())}</span>;
    }

    const { rerender } = render(<Probe />);
    for (let i = 0; i < 6; i++) rerender(<Probe key={i} />);

    const canvasCreations = createElementSpy.mock.calls.filter(
      (call) => call[0] === "canvas"
    ).length;
    expect(canvasCreations).toBeLessThanOrEqual(1);

    createElementSpy.mockRestore();
  });

  it("constructs the reduced-motion MediaQueryList at most once across many renders", () => {
    const mqFactory = jest.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    // jsdom does not implement matchMedia; install a counting mock.
    window.matchMedia = mqFactory as unknown as typeof window.matchMedia;

    function Probe() {
      return <span data-testid="rmotion">{String(usePrefersReducedMotion())}</span>;
    }

    const { rerender } = render(<Probe />);
    for (let i = 0; i < 6; i++) rerender(<Probe key={i} />);

    expect(mqFactory.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
