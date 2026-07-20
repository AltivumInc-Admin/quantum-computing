/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { KernelExplorer } from "@/components/quantum/kernel-explorer";

// jsdom does not implement matchMedia; quantum widgets may read reduced-motion.
function mockMatchMedia(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((q: string) => ({
    matches: reduced, media: q, onchange: null,
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn(),
  }));
}

describe("KernelExplorer", () => {
  beforeEach(() => mockMatchMedia(false));
  it("renders the Quantum kernel header and an accuracy readout", () => {
    render(<KernelExplorer source={JSON.stringify({ dataset: "circles", map: "iqp" })} />);
    expect(screen.getByText(/quantum kernel/i)).toBeInTheDocument();
    // Target the live readout: the scale caption also says "accuracy", so the
    // bare word matches more than one element.
    expect(screen.getByRole("status")).toHaveTextContent(/accuracy/i);
  });
  it("qualifies both readouts as training scores (they are evaluated in-sample)", () => {
    render(<KernelExplorer source={JSON.stringify({ dataset: "circles", map: "iqp" })} />);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent(/training accuracy/i);
    expect(live).toHaveTextContent(/linear baseline \(training\)/i);
  });
  it("renders an error card for malformed JSON", () => {
    render(<KernelExplorer source={"{ not json"} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
  it("rejects an unknown dataset with the exact field error", () => {
    render(<KernelExplorer source={JSON.stringify({ dataset: "moons" })} />);
    expect(screen.getByText(/"dataset" must be "circles" or "xor"/)).toBeInTheDocument();
  });
  it("rejects an unknown map with the exact field error", () => {
    render(<KernelExplorer source={JSON.stringify({ map: "zz" })} />);
    expect(screen.getByText(/"map" must be "angle" or "iqp"/)).toBeInTheDocument();
  });

  /**
   * The scale caption used to assert "the boundary starts to alias" regardless
   * of the selected map. Measured over the slider's own 0.3-2.0 range on the
   * shipped dataset, that holds for `iqp` (in-sample 88 -> 98 -> 83%) but is
   * false for `angle`, which improves monotonically (68 -> 98%) because its
   * rotation argument never reaches the pi wrap-around. These two pin the
   * caption to the selected map so it can never re-generalize.
   */
  it("warns about over-encoding only for the entangling iqp map", () => {
    render(<KernelExplorer source={JSON.stringify({ dataset: "circles", map: "iqp" })} />);
    expect(screen.getByText(/over-encodes/i)).toBeInTheDocument();
    expect(screen.queryByText(/cannot over-encode/i)).not.toBeInTheDocument();
  });
  it("tells the truth for the angle map: pushing the scale only helps", () => {
    render(<KernelExplorer source={JSON.stringify({ dataset: "circles", map: "angle" })} />);
    expect(screen.getByText(/cannot over-encode/i)).toBeInTheDocument();
  });
  it("swapping the map via the select swaps the scale lesson with it", () => {
    render(<KernelExplorer source={JSON.stringify({ dataset: "circles", map: "iqp" })} />);
    expect(screen.getByText(/over-encodes/i)).toBeInTheDocument();
    act(() => {
      fireEvent.change(screen.getByLabelText(/quantum feature map/i), {
        target: { value: "angle" },
      });
    });
    expect(screen.getByText(/cannot over-encode/i)).toBeInTheDocument();
  });
  it("moving the scale slider recomputes the boundary and settles un-busied", () => {
    render(<KernelExplorer source={JSON.stringify({ dataset: "circles", map: "iqp" })} />);
    const before = screen.getByRole("status").textContent;
    act(() => {
      fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    });
    // The accuracy readout is driven by the deferred value, so it must have
    // caught up — and neither it nor the plot may still claim to be stale.
    expect(screen.getByRole("status").textContent).not.toEqual(before);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "false");
    const svg = screen.getByRole("img");
    expect(svg).toHaveAttribute("aria-busy", "false");
    // The image describes the scale it was actually drawn at.
    expect(svg).toHaveAttribute("aria-label", expect.stringContaining("scale 2.00"));
  });
});
