/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";

import { HamiltonianExplorer } from "@/components/quantum/hamiltonian-explorer";

// jsdom does not implement matchMedia; the widget's reduced-motion hook needs it
// (same shim markdown-renderer.fence-routing.test.tsx uses).
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

describe("HamiltonianExplorer", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders the H2 Hamiltonian header for an empty source (equilibrium R)", () => {
    render(<HamiltonianExplorer source="" />);
    expect(screen.getByText("H2 Hamiltonian")).toBeInTheDocument();
  });

  it("renders the H2 Hamiltonian header for a valid JSON source", () => {
    render(<HamiltonianExplorer source={JSON.stringify({ R: 0.75, tapered: false })} />);
    expect(screen.getByText("H2 Hamiltonian")).toBeInTheDocument();
  });

  it("renders the qham error card for a malformed source without throwing", () => {
    expect(() => render(<HamiltonianExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qham error:/)).toBeInTheDocument();
  });
});
