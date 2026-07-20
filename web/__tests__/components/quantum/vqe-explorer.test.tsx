/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VqeExplorer } from "@/components/quantum/vqe-explorer";

// jsdom does not implement matchMedia; VqeExplorer's reduced-motion hook needs
// it. Mirror markdown-renderer.fence-routing.test.tsx's mock.
function mockMatchMedia(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

describe("VqeExplorer", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders the header for an empty source (equilibrium default)", () => {
    render(<VqeExplorer source="" />);
    expect(screen.getByText("VQE energy landscape")).toBeInTheDocument();
  });

  it("renders the header for a valid JSON source", () => {
    render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />);
    expect(screen.getByText("VQE energy landscape")).toBeInTheDocument();
  });

  it("renders the qvqe error card for a malformed source without throwing", () => {
    expect(() => render(<VqeExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qvqe error:/i)).toBeInTheDocument();
  });

  it("plots lower energy lower: the above-floor marker sits above the floor line", () => {
    // At the default theta (0.4) the energy is above the variational floor, so
    // with the corrected y-map the marker dot is HIGHER on screen (smaller cy)
    // than the dashed floor line. This fails on the pre-fix upside-down map.
    const { container } = render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />);
    const svg = container.querySelector(
      'svg[aria-label^="Variational energy"]'
    ) as SVGSVGElement;
    const marker = svg.querySelector("circle")!;
    const floor = svg.querySelector('line[stroke-dasharray="3 3"]')!;
    const markerCy = Number(marker.getAttribute("cy"));
    const floorY = Number(floor.getAttribute("y1"));
    expect(markerCy).toBeLessThan(floorY);
  });

  it("keeps theta within the slider domain [-pi, pi] after Optimize", () => {
    mockMatchMedia(true); // reduced motion -> jump straight to the optimized angle
    render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />);
    fireEvent.click(screen.getByRole("button", { name: /optimize/i }));
    const slider = screen.getByRole("slider") as HTMLInputElement;
    const value = Number(slider.value);
    expect(value).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
    expect(value).toBeLessThanOrEqual(Math.PI + 1e-9);
  });

  it("announces the settled energy after Optimize", () => {
    mockMatchMedia(true);
    render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />);
    fireEvent.click(screen.getByRole("button", { name: /optimize/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/hartree/i);
  });

  it("the Optimize animation never climbs the energy hill", () => {
    // At R = 0.75 the fixture gives c0 = -0.338656, cz = +0.777495,
    // cx = +0.181772, so E(theta) = c0 + A cos(theta - phi) with A = 0.798461
    // and phi = +0.2297 rad: the MAXIMUM sits at +0.23 and the minimum at
    // -2.9119 == +3.3713. Gradient descent from any theta right of the maximum
    // flows RIGHTWARD to +3.3713 and exits via +pi. The old code wrapped that
    // endpoint to -2.9119 first and then lerped toward it, sweeping the marker
    // backwards THROUGH the maximum: from theta = 3.0 it climbed 1.542 Ha,
    // 96.6% of the plot's height, on a widget captioned "slides theta down to
    // the variational floor". Measured across [-pi, pi], 45.7% of starting
    // angles animated uphill.
    jest.useFakeTimers();
    mockMatchMedia(false);
    const { container } = render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "3" } });

    const svg = container.querySelector(
      'svg[aria-label^="Variational energy"]'
    ) as SVGSVGElement;
    // energyToY maps eMax -> top of the plot and eMin -> bottom, so a falling
    // energy means a NON-DECREASING cy. One assertion covers every frame.
    const markerCy = () => Number(svg.querySelector("circle")!.getAttribute("cy"));

    let prev = markerCy();
    fireEvent.click(screen.getByRole("button", { name: "Optimize" }));
    for (let frame = 0; frame < 45; frame++) {
      act(() => {
        jest.advanceTimersByTime(32);
      });
      const cy = markerCy();
      expect(cy).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = cy;
    }
    jest.useRealTimers();
  });

  it("keeps the theta slider's valuetext angle-only (LiveStatus owns the energy)", () => {
    // Mirrors the pinned qham rule: the polite status already leads with this
    // energy and re-fires on the same theta ticks, so repeating it in the
    // valuetext announced the value twice per arrow press.
    render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuetext", expect.stringMatching(/radians/));
    expect(slider).not.toHaveAttribute(
      "aria-valuetext",
      expect.stringMatching(/hartree/)
    );
  });

  it("seeds theta on the slider's own step lattice", () => {
    // min + n*step, not the literal 0.4: a step-mismatched value is sanitized by
    // the range input, so the thumb sat at 0.3840 while the readout said 0.40.
    render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    const step = Math.PI / 90;
    const n = (Number(slider.value) + Math.PI) / step;
    expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9);
  });

  it("clears the pending optimize-animation timer on unmount", () => {
    jest.useFakeTimers();
    mockMatchMedia(false);
    const clearSpy = jest.spyOn(global, "clearTimeout");
    const { unmount } = render(<VqeExplorer source={JSON.stringify({ R: 0.75 })} />);
    fireEvent.click(screen.getByRole("button", { name: /optimize/i }));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
    jest.useRealTimers();
  });
});
