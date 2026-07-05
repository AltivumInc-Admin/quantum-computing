/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlochTargetWidget } from "@/components/quantum/bloch-target-widget";
import { getCardState } from "@/lib/review-store";
import { blochCardId } from "@/lib/challenge-review";

// jsdom has no WebGL, so the widget always renders the 2D BlochDial fallback;
// matchMedia still needs the standard mock (usePrefersReducedMotion probes it).
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

const plusTarget = JSON.stringify({
  id: "t-bloch-plus",
  prompt: "Drive the Bloch vector to |+>.",
  target: { program: "H 0" },
  hint: "It sits on the equator.",
});

const setTheta = (value: number) =>
  fireEvent.change(screen.getByLabelText(/polar angle theta/i), {
    target: { value: String(value) },
  });
const check = () => fireEvent.click(screen.getByRole("button", { name: /check position/i }));

// The dial's target ghost is the only dashed SVG geometry in the widget.
const ghostMarkers = (container: HTMLElement) =>
  container.querySelectorAll("[stroke-dasharray]").length;

describe("BlochTargetWidget", () => {
  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(false);
  });

  it("renders the prompt, target chips, sliders, and the ghost", () => {
    const { container } = render(<BlochTargetWidget source={plusTarget} />);
    expect(screen.getByText(/drive the bloch vector/i)).toBeInTheDocument();
    expect(screen.getByText(/within 5\.0°/)).toBeInTheDocument();
    expect(screen.getByLabelText(/polar angle theta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/azimuthal angle phi/i)).toBeInTheDocument();
    expect(ghostMarkers(container)).toBeGreaterThan(0);
  });

  it("starts at |0> so the most common targets can't be solved without moving", () => {
    render(<BlochTargetWidget source={plusTarget} />);
    check();
    expect(screen.getByText(/off by 90\.0°/i)).toBeInTheDocument();
    expect(getCardState(blochCardId("t-bloch-plus"))).toBeNull();
  });

  it("a clean solve schedules the card as good", () => {
    render(<BlochTargetWidget source={plusTarget} />);
    setTheta(Math.PI / 2);
    check();
    expect(screen.getByText(/added to your review/i)).toBeInTheDocument();
    const card = getCardState(blochCardId("t-bloch-plus"))!;
    expect(card.reps).toBe(1);
    expect(card.lapses).toBe(0);
    expect(card.difficulty).toBe(5); // "good" leaves the default difficulty
  });

  it("a solve after a miss grades hard, and the miss shows the hint", () => {
    render(<BlochTargetWidget source={plusTarget} />);
    check(); // miss at |0>
    expect(screen.getByText(/it sits on the equator/i)).toBeInTheDocument();
    setTheta(Math.PI / 2);
    check();
    const card = getCardState(blochCardId("t-bloch-plus"))!;
    expect(card.reps).toBe(1);
    expect(card.difficulty).toBeCloseTo(5.3, 10); // "hard" nudges difficulty up
  });

  it("solves a near miss within tolerance (one slider step off target)", () => {
    render(<BlochTargetWidget source={plusTarget} />);
    setTheta(Math.PI / 2 + Math.PI / 60); // 3 degrees of arc, inside the 5-degree tolerance
    check();
    expect(getCardState(blochCardId("t-bloch-plus"))).not.toBeNull();
  });

  it("blind mode hides the ghost AND the target ket (the amplitudes are the answer) until solved", () => {
    const blind = JSON.stringify({
      id: "t-blind",
      prompt: "Place |+> without the ghost.",
      target: { program: "H 0" },
      blind: true,
    });
    const { container } = render(<BlochTargetWidget source={blind} />);
    expect(screen.getByText(/from memory/i)).toBeInTheDocument(); // the blind-mode chip
    expect(ghostMarkers(container)).toBe(0);
    expect(screen.queryByText(/Target 0\.71/)).not.toBeInTheDocument(); // no answer leak
    setTheta(Math.PI / 2);
    check();
    expect(ghostMarkers(container)).toBeGreaterThan(0); // revealed for comparison
    expect(screen.getByText(/Target 0\.71/)).toBeInTheDocument();
  });

  it("moving a slider clears the stale miss readout but keeps the earned hint", () => {
    render(<BlochTargetWidget source={plusTarget} />);
    check(); // miss at |0>
    expect(screen.getByText(/off by 90\.0°/i)).toBeInTheDocument();
    setTheta(Math.PI / 2); // position changed — the readout no longer describes it
    expect(screen.queryByText(/off by/i)).not.toBeInTheDocument();
    expect(screen.getByText(/it sits on the equator/i)).toBeInTheDocument();
  });

  it("moves focus to the announced outcome when the Check button unmounts on solve", () => {
    render(<BlochTargetWidget source={plusTarget} />);
    screen.getByRole("button", { name: /check position/i }).focus();
    setTheta(Math.PI / 2);
    check();
    expect(document.activeElement).toHaveAttribute("role", "status");
    expect(document.activeElement!.textContent).toMatch(/on target/i);
  });

  it("caches its kind + raw fence source so /review can re-mount the live widget", () => {
    render(<BlochTargetWidget source={plusTarget} />);
    const content = JSON.parse(
      localStorage.getItem("qc:card-content:bloch:t-bloch-plus")!
    );
    expect(content.kind).toBe("bloch");
    expect(content.source).toBe(plusTarget);
  });

  it("writes no card for a multi-qubit target and shows the error", () => {
    const bad = JSON.stringify({
      id: "t-bad",
      prompt: "p",
      target: { program: "H 0\nCNOT 0 1" },
    });
    render(<BlochTargetWidget source={bad} />);
    expect(screen.getByText(/bloch-target error/i)).toBeInTheDocument();
    expect(Object.keys(localStorage).some((k) => k.startsWith("qc:card:bloch:"))).toBe(false);
  });
});
