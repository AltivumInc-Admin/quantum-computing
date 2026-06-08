/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ScrollySection } from "@/components/quantum/scrolly-section";

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

const SOURCE = JSON.stringify({
  beats: [
    { caption: "It starts in the ground state.", theta: 0 },
    { caption: "A Hadamard tips it to the equator.", theta: Math.PI / 2 },
    { caption: "Now it points at the south pole.", theta: Math.PI },
  ],
});

describe("ScrollySection", () => {
  // jsdom provides no WebGL, so the capability gate always renders the static
  // fallback here — which is exactly what the static export and reduced-motion
  // users get, so it is the path worth asserting.
  it("renders every beat caption in the static fallback (reduced motion)", () => {
    mockMatchMedia(true);
    render(<ScrollySection source={SOURCE} />);
    expect(screen.getByText("It starts in the ground state.")).toBeInTheDocument();
    expect(screen.getByText("A Hadamard tips it to the equator.")).toBeInTheDocument();
    expect(screen.getByText("Now it points at the south pole.")).toBeInTheDocument();
  });

  it("falls back to the static walkthrough when WebGL is unavailable", () => {
    mockMatchMedia(false); // motion allowed, but jsdom has no WebGL
    render(<ScrollySection source={SOURCE} />);
    expect(screen.getByText("Walkthrough")).toBeInTheDocument();
    // One Bloch dial per beat (each labelled with its vector for a11y).
    expect(screen.getAllByRole("img").length).toBe(3);
  });

  it("renders an error card for malformed source", () => {
    mockMatchMedia(false);
    render(<ScrollySection source={"{ not json"} />);
    expect(screen.getByText(/scrolly error:/i)).toBeInTheDocument();
  });

  it("rejects a single-beat scrolly", () => {
    mockMatchMedia(false);
    render(<ScrollySection source={JSON.stringify({ beats: [{ caption: "only one", theta: 0 }] })} />);
    expect(screen.getByText(/at least two beats/i)).toBeInTheDocument();
  });
});
