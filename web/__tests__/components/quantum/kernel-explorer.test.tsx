/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/accuracy/i)).toBeInTheDocument();
  });
  it("renders an error card for malformed JSON", () => {
    render(<KernelExplorer source={"{ not json"} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
