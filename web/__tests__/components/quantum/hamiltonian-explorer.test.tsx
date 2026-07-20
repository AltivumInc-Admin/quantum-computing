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

  // One sampling rule for the whole widget. The tapered coefficients used to
  // come from h2OneQubit(R), which INTERPOLATES, while the 15-term list snapped
  // to the nearest committed row — so at the shipped R = 0.74 the toggle
  // compared two different Hamiltonians (c0 -0.3262 vs -0.3387, a 12.5 mHa gap
  // at a 4-decimal display) under one caption claiming both were "sampled at
  // R = 0.75" and a footer promising none were invented.
  it("reads both modes off the same committed fixture row for an off-grid R", () => {
    render(<HamiltonianExplorer source={JSON.stringify({ R: 0.74, tapered: true })} />);
    const slider = screen.getAllByRole("slider")[0];
    // The R = 0.75 fixture row: c0 = -0.338656, cz = +0.777495, cx = +0.181772.
    // Interpolation at 0.74 would give -0.3262 / +0.7902 / +0.1812.
    expect(slider).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("c0 -0.3387, cz +0.7775, cx +0.1818")
    );
    expect(screen.getByRole("status")).toHaveTextContent(/R = 0\.75 angstrom/);
  });

  it("seeds R onto the fixture's own step lattice (0.74 is a step mismatch)", () => {
    render(<HamiltonianExplorer source={JSON.stringify({ R: 0.74, tapered: false })} />);
    const slider = screen.getAllByRole("slider")[0] as HTMLInputElement;
    // The thumb, the readout and the live region must agree from first paint:
    // the range input sanitizes an off-lattice value, so state held 0.74 while
    // the DOM held 0.75 and the first arrow press jumped to 0.80.
    expect(Number(slider.value)).toBeCloseTo(0.75, 10);
    expect(screen.getByText(/sampled at R = 0\.75/)).toBeInTheDocument();
  });

  it("exposes the term-list summary via sr-only text, not a zero-area svg", () => {
    const { container } = render(
      <HamiltonianExplorer source={JSON.stringify({ R: 0.75, tapered: false })} />
    );
    expect(container.querySelector("svg[width='0']")).toBeNull();
    const srText = Array.from(container.querySelectorAll("p.sr-only"))
      .map((el) => el.textContent ?? "")
      .join(" | ");
    expect(srText).toMatch(/15 weighted Pauli terms/);
  });

  it("presents the tapering control as a plain button, not a switch", () => {
    // A role="switch" whose accessible name flips with its own aria-checked
    // announces "Show full 4-qubit Hamiltonian, switch, on" — the inverse of
    // the active mode. The chips and LiveStatus already state the mode.
    render(<HamiltonianExplorer source={JSON.stringify({ R: 0.75, tapered: true })} />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByRole("button", { name: /show full 4-qubit hamiltonian/i })
    ).toBeInTheDocument();
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
