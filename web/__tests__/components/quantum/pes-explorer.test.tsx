/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";

import { PesExplorer } from "@/components/quantum/pes-explorer";

// jsdom does not implement matchMedia; the widgets' reduced-motion handling
// (and any consumer code) may probe it, so mock it defensively the same way
// markdown-renderer.fence-routing.test.tsx does.
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

describe("PesExplorer", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders the header with an empty source (defaults to equilibrium)", () => {
    render(<PesExplorer source="" />);
    expect(screen.getByText("Potential energy surface")).toBeInTheDocument();
  });

  it("renders the header with a valid JSON source", () => {
    render(<PesExplorer source={JSON.stringify({ mark: 1.2 })} />);
    expect(screen.getByText("Potential energy surface")).toBeInTheDocument();
  });

  it("renders the qpes error card on a malformed source without throwing", () => {
    expect(() => render(<PesExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qpes error:/)).toBeInTheDocument();
  });
});
