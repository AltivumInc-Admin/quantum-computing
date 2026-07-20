/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WavefunctionScrubber } from "@/components/quantum/wavefunction-scrubber";

/** Mirrors STEP_MS in the widget. */
const STEP_MS = 750;

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

describe("WavefunctionScrubber", () => {
  beforeEach(() => mockMatchMedia(false));

  it("renders a parse error for invalid DSL", () => {
    render(<WavefunctionScrubber source="FOO 0" />);
    expect(screen.getByText(/parse error/i)).toBeInTheDocument();
  });

  it("renders a scrub slider spanning the gate count (frames 0..N)", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    const slider = screen.getByRole("slider", { name: /step/i });
    expect(slider).toHaveAttribute("max", "2");
  });

  it("announces the scrub position via aria-valuetext", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    const slider = screen.getByRole("slider", { name: /step/i });
    expect(slider).toHaveAttribute("aria-valuetext", expect.stringMatching(/step \d+ of \d+/i));
  });

  it("shows the |0...0> ground state at step 0", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    expect(screen.getByText(/1\.00\|00⟩/)).toBeInTheDocument();
  });

  it("advances the state vector when the scrubber moves", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    const slider = screen.getByRole("slider", { name: /step/i });
    fireEvent.change(slider, { target: { value: "2" } });
    // Dirac line shows the Bell superposition (0.71|00> + 0.71|11>); the
    // 0.71 prefix distinguishes it from the bare |11> amplitude-bar label.
    expect(screen.getByText(/0\.71\|11⟩/)).toBeInTheDocument();
  });

  it("marks exactly one gate chip as the current step after a scrub", () => {
    const { container } = render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    const slider = screen.getByRole("slider", { name: /step/i });
    fireEvent.change(slider, { target: { value: "2" } });
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("renders the fallback Bloch dial at 180px for a single-qubit circuit", () => {
    render(<WavefunctionScrubber source="H 0" />);
    const svg = screen.getByLabelText(/bloch vector/i);
    expect(svg).toHaveAttribute("width", "180");
    expect(svg).toHaveAttribute("height", "180");
  });
  it("offers a Play control when motion is allowed", () => {
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("hides the Play control under prefers-reduced-motion", () => {
    mockMatchMedia(true);
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    expect(
      screen.queryByRole("button", { name: /play/i })
    ).not.toBeInTheDocument();
  });

  it("names the transport control by its ACTION, with no contradictory aria-pressed", () => {
    // aria-pressed alongside a swapping name announced "Pause animation,
    // toggle button, pressed" mid-playback — i.e. "paused is engaged".
    render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);
    expect(screen.getByRole("button", { name: "Play animation" })).not.toHaveAttribute(
      "aria-pressed"
    );
  });
});

/**
 * The play/pause/replay timer state machine — the widget's only timer-driven
 * logic, and previously untested: the suite asserted the Play button's presence
 * and nothing about what it does.
 */
describe("WavefunctionScrubber auto-advance", () => {
  const SOURCE = "H 0\nCNOT 0 1"; // 3 frames: steps 0, 1, 2

  beforeEach(() => {
    mockMatchMedia(false);
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  const stepSlider = () => screen.getByRole("slider", { name: /step/i });
  const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });
  // Each timeout is only scheduled by the effect that runs AFTER the previous
  // one's state update commits, so N steps take N discrete advances — one
  // advanceTimersByTime(N * STEP_MS) would fire exactly one tick.
  const advanceSteps = (n: number) => { for (let i = 0; i < n; i++) advance(STEP_MS); };

  it("advances one step per STEP_MS while playing", () => {
    render(<WavefunctionScrubber source={SOURCE} />);
    expect(stepSlider()).toHaveValue("0");

    fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
    advance(STEP_MS);
    expect(stepSlider()).toHaveValue("1");
    // The gate chip for the gate that produced this frame is the current step.
    expect(screen.getByText("H q0")).toHaveAttribute("aria-current", "step");

    advance(STEP_MS);
    expect(stepSlider()).toHaveValue("2");
    expect(screen.getByText("CNOT 0→1")).toHaveAttribute("aria-current", "step");
  });

  it("stops scheduling at the last step (the button flips back to Play)", () => {
    render(<WavefunctionScrubber source={SOURCE} />);
    fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
    advanceSteps(2);
    expect(stepSlider()).toHaveValue("2");
    expect(screen.getByRole("button", { name: "Play animation" })).toBeInTheDocument();

    // No further timer is pending: more time changes nothing.
    advanceSteps(5);
    expect(stepSlider()).toHaveValue("2");
  });

  it("replays from step 0 when Play is pressed at the end", () => {
    render(<WavefunctionScrubber source={SOURCE} />);
    fireEvent.change(stepSlider(), { target: { value: "2" } });
    expect(stepSlider()).toHaveValue("2");

    fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
    expect(stepSlider()).toHaveValue("0"); // reset is synchronous
    advance(STEP_MS);
    expect(stepSlider()).toHaveValue("1"); // and it resumed advancing
  });

  it("pauses when the learner scrubs mid-play", () => {
    render(<WavefunctionScrubber source={SOURCE} />);
    fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
    expect(screen.getByRole("button", { name: "Pause animation" })).toBeInTheDocument();

    fireEvent.change(stepSlider(), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Play animation" })).toBeInTheDocument();
    // Playback really stopped — the step stays where the learner put it.
    advanceSteps(3);
    expect(stepSlider()).toHaveValue("1");
  });

  it("pauses on a second click and stops advancing", () => {
    render(<WavefunctionScrubber source={SOURCE} />);
    fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause animation" }));
    advanceSteps(3);
    expect(stepSlider()).toHaveValue("0");
  });
});

describe("live-region discipline", () => {
  it("announces one concise summary and does not nest live regions in the readout column", () => {
    const { container } = render(<WavefunctionScrubber source={"H 0\nCNOT 0 1"} />);

    // The widget's own status line carries the announcement. The other
    // role="status" nodes are the CopyButtons' copy-confirmations, which is
    // exactly the point: they are now SIBLINGS of the readout column, not
    // nested inside a live region wrapping it.
    const statuses = screen.getAllByRole("status");
    expect(statuses[0].textContent).toMatch(/Step 0 of \d+\. Most likely outcome/);
    for (const s of statuses) {
      expect(s.querySelector('[role="status"]')).toBeNull();
    }

    // The readout column must not itself be a live region: StateReadout's
    // CopyButtons each own one, so a wrapper would nest them.
    const bars = container.querySelector(".min-w-0.flex-1");
    expect(bars).not.toBeNull();
    expect(bars).not.toHaveAttribute("aria-live");
    expect(bars).not.toHaveAttribute("role", "status");
  });
});
