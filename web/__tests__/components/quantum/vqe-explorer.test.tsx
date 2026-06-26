/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
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
});
