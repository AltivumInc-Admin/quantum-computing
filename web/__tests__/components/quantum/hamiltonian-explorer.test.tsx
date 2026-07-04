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

  it("announces the bond length and largest-term coefficient", () => {
    render(<HamiltonianExplorer source={JSON.stringify({ R: 0.75, tapered: false })} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/R = /);
    expect(status).toHaveTextContent(/hartree/i);
  });

  it("uses lowercase screen-reader units (angstrom/hartree), never a capitalized unit", () => {
    const { container } = render(
      <HamiltonianExplorer source={JSON.stringify({ R: 0.75, tapered: false })} />
    );
    const text = container.textContent ?? "";
    // The SR readout spells the units out in lowercase ("0.75 angstrom ... hartree").
    expect(text).toMatch(/\bangstrom\b/);
    expect(text).toMatch(/\bhartree\b/);
    // The unit is never a number-prefixed capital ("0.75 Angstrom" / "1.1 Hartree").
    // "Hartree-Fock" (the method, a proper noun) is intentionally still allowed.
    expect(text).not.toMatch(/\d\s*Angstrom/);
    expect(text).not.toMatch(/\d\s*Hartree/);
  });

  it("embeds the driven coefficients in the R slider's aria-valuetext (tapered mode)", () => {
    render(<HamiltonianExplorer source={JSON.stringify({ R: 0.75, tapered: true })} />);
    const slider = screen.getAllByRole("slider")[0];
    expect(slider).toHaveAttribute(
      "aria-valuetext",
      expect.stringMatching(/coefficients c0 [+-][\d.]+, cz [+-][\d.]+, cx [+-][\d.]+ hartree/)
    );
    // Still leads with the bond length.
    expect(slider).toHaveAttribute("aria-valuetext", expect.stringMatching(/angstrom/));
  });

  it("keeps the full-mode aria-valuetext bond-length-only (LiveStatus owns the largest term)", () => {
    render(<HamiltonianExplorer source={JSON.stringify({ R: 0.75, tapered: false })} />);
    const slider = screen.getAllByRole("slider")[0];
    // The polite LiveStatus already announces the largest term on every step;
    // duplicating it in the valuetext would double-announce per keystroke.
    expect(slider).toHaveAttribute("aria-valuetext", expect.stringMatching(/angstrom/));
    expect(slider).not.toHaveAttribute("aria-valuetext", expect.stringMatching(/largest|hartree/));
  });

  it("never renders a negative-zero coefficient (signed() snaps -0 to +0)", () => {
    // Sweep tapered + full across bond lengths so any near-zero term is exercised.
    for (const R of [0.5, 0.74, 1.2, 2.0]) {
      for (const tapered of [false, true]) {
        const { container, unmount } = render(
          <HamiltonianExplorer source={JSON.stringify({ R, tapered })} />
        );
        expect(container.textContent ?? "").not.toMatch(/-0\.0000/);
        unmount();
      }
    }
  });
});
