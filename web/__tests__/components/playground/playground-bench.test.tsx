/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { encodeShareHash } from "@/lib/circuit-url";
import { peekHandoff } from "@/lib/qpu-handoff";
import { QASM_SUBMIT_BYTE_CAP } from "@/lib/compile-qasm";
import { parseProgram, opsFor } from "@/components/quantum/qsim-dsl";
import { simulate, probabilities } from "@/components/quantum/math";
import { sampleCounts } from "@/components/quantum/shots";
import { mulberry32 } from "@/components/quantum/rng";
import { formatPercent } from "@/components/quantum/format";
import { costLabel } from "@/components/quantum/cost";

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock("@/lib/qpu-client", () => ({
  __esModule: true,
  isQpuConfigured: jest.fn(() => false),
}));
import { isQpuConfigured } from "@/lib/qpu-client";

import {
  PlaygroundBench,
  DEFAULT_SOURCE,
} from "@/components/playground/playground-bench";
import { NONCE_STRIDE } from "@/components/playground/sampling-panel";

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

// The circuit store keys saves by crypto.randomUUID(), which older jsdom lacks.
let uuidCounter = 0;
beforeAll(() => {
  const c = globalThis.crypto as { randomUUID?: () => string };
  if (typeof c.randomUUID !== "function") {
    Object.defineProperty(c, "randomUUID", {
      configurable: true,
      value: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
    });
  }
});

beforeEach(() => {
  mockMatchMedia(false);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/"); // clears any #c= left by a prior test
  pushMock.mockClear();
  (isQpuConfigured as jest.Mock).mockReturnValue(false);
});

const sourceBox = () => screen.getByLabelText("qsim circuit source") as HTMLTextAreaElement;
const stateRegion = () => screen.getByRole("region", { name: "State" });

describe("PlaygroundBench", () => {
  it("renders the default Bell source with a live parse status and all five panels", () => {
    render(<PlaygroundBench />);
    expect(sourceBox()).toHaveValue(DEFAULT_SOURCE);
    expect(screen.getByText("2 qubits — 2 gates")).toBeInTheDocument();
    for (const name of ["Compose", "State", "Sampling", "Hardware", "Saved circuits"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    // The scrubber parks on the final frame: the Bell state, live with no run button.
    expect(screen.getByText(/0\.71\|00⟩/)).toBeInTheDocument();
    expect(within(stateRegion()).getAllByText("50.0%")).toHaveLength(2);
    expect(screen.getByText("Ideal simulation — exact amplitudes, no noise.")).toBeInTheDocument();
  });

  it("keeps the last-good state rendered on a parse error (the Quirk principle)", () => {
    render(<PlaygroundBench />);
    fireEvent.change(sourceBox(), { target: { value: "H 0\nFLURB 1" } });
    expect(screen.getByText(/unknown gate "FLURB"/)).toBeInTheDocument();
    // The Bell readouts never blank
    expect(screen.getByText(/0\.71\|00⟩/)).toBeInTheDocument();
    expect(within(stateRegion()).getAllByText("50.0%")).toHaveLength(2);
    // and fixing the source picks the live state back up
    fireEvent.change(sourceBox(), { target: { value: "H 0\nH 1" } });
    expect(within(stateRegion()).getAllByText("25.0%")).toHaveLength(4);
  });

  it("updates the outcome bars per keystroke and follows the end as gates are added", () => {
    render(<PlaygroundBench />);
    // 2 gates -> 3 gates: the scrubber was at the end, so it follows to the new end
    fireEvent.change(sourceBox(), { target: { value: "H 0\nH 1\nH 2" } });
    expect(within(stateRegion()).getAllByText("12.5%")).toHaveLength(8);
    expect(screen.getByText("3 qubits — 3 gates")).toBeInTheDocument();
  });

  it("does not snap an intentionally scrubbed-back position when the circuit grows", () => {
    render(<PlaygroundBench />);
    const slider = screen.getByRole("slider", { name: "Step through the circuit" });
    fireEvent.change(slider, { target: { value: "0" } });
    fireEvent.change(sourceBox(), { target: { value: "H 0\nCNOT 0 1\nX 1" } });
    // Still on the initial frame, not yanked to the new end
    expect(slider).toHaveAttribute("aria-valuetext", "initial state |00⟩");
    expect(within(stateRegion()).getByText("100.0%")).toBeInTheDocument();
  });

  it("scrubs the displayed frame — step 0 shows the |00⟩ ground state", () => {
    render(<PlaygroundBench />);
    const slider = screen.getByRole("slider", { name: "Step through the circuit" });
    expect(slider).toHaveAttribute("max", "2");
    expect(slider).toHaveAttribute("aria-valuetext", "after gate 2 of 2: CNOT 0 1");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(slider).toHaveAttribute("aria-valuetext", "initial state |00⟩");
    expect(within(stateRegion()).getByText("100.0%")).toBeInTheDocument();
    expect(screen.getByText(/1\.00\|00⟩/)).toBeInTheDocument();
  });

  it("offers play without autoplaying, and hides it under reduced motion", () => {
    const { unmount } = render(<PlaygroundBench />);
    expect(screen.getByRole("button", { name: "Play animation" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    unmount();
    mockMatchMedia(true);
    render(<PlaygroundBench />);
    expect(screen.queryByRole("button", { name: /play animation/i })).not.toBeInTheDocument();
  });

  it("inserts a palette instruction at the tracked caret", () => {
    render(<PlaygroundBench />);
    const ta = sourceBox();
    // No caret yet -> appends at the end, on its own line
    fireEvent.click(screen.getByRole("button", { name: "Insert H 0" }));
    expect(ta).toHaveValue(`${DEFAULT_SOURCE}\nH 0`);
    expect(screen.getByText("2 qubits — 3 gates")).toBeInTheDocument();
    // Caret at the very start -> the instruction lands there, still on its own line
    ta.setSelectionRange(0, 0);
    fireEvent.select(ta);
    fireEvent.click(screen.getByRole("button", { name: "Insert CNOT 0 1" }));
    expect(ta.value.startsWith("CNOT 0 1\n")).toBe(true);
  });

  it("replaces the whole source from a preset", () => {
    render(<PlaygroundBench />);
    fireEvent.click(screen.getByRole("button", { name: "Interference" }));
    expect(sourceBox()).toHaveValue("H 0\nZ 0\nH 0");
    fireEvent.click(screen.getByRole("button", { name: "Superposition" }));
    expect(sourceBox()).toHaveValue("H 0");
  });

  it("shows the theta slider for a bound rotation and feeds theta to the compiler", () => {
    render(<PlaygroundBench />);
    expect(
      screen.queryByRole("slider", { name: "Rotation angle theta in radians" }),
    ).not.toBeInTheDocument();
    fireEvent.change(sourceBox(), { target: { value: "RY 0 theta" } });
    const theta = screen.getByRole("slider", { name: "Rotation angle theta in radians" });
    expect(theta).toBeInTheDocument();
    // The pi/2 default reaches the OpenQASM export
    expect(document.querySelector("pre")?.textContent).toContain("ry(1.570796) q[0];");
    // and moving the slider recompiles
    fireEvent.change(theta, { target: { value: String(Math.PI) } });
    expect(document.querySelector("pre")?.textContent).toContain("ry(3.141593) q[0];");
  });

  it("round-trips a circuit through save, list, load, and two-step delete", () => {
    render(<PlaygroundBench />);
    fireEvent.change(screen.getByLabelText("Circuit name"), { target: { value: "My Bell" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText('Saved "My Bell"')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load My Bell" })).toBeInTheDocument();
    // Input clears on save; the bench remembers it is editing the saved circuit
    expect(screen.getByLabelText("Circuit name")).toHaveValue("");
    expect(screen.getByText(/Save updates it/)).toBeInTheDocument();

    // Change the bench, then Load restores the saved source
    fireEvent.change(sourceBox(), { target: { value: "H 0" } });
    fireEvent.click(screen.getByRole("button", { name: "Load My Bell" }));
    expect(sourceBox()).toHaveValue(DEFAULT_SOURCE);

    // Two-step inline delete: first click arms, second click deletes (no window.confirm)
    fireEvent.click(screen.getByRole("button", { name: "Delete My Bell" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete My Bell" }));
    expect(screen.queryByRole("button", { name: "Load My Bell" })).not.toBeInTheDocument();
    expect(screen.getByText(/nothing saved yet/i)).toBeInTheDocument();
  });

  it("surfaces the store's error when a save is rejected", () => {
    render(<PlaygroundBench />);
    fireEvent.click(screen.getByRole("button", { name: "Save" })); // no name
    expect(screen.getByText("give the circuit a name")).toBeInTheDocument();
  });

  it("copies a share link that encodes the bench", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<PlaygroundBench />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy share link" }));
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain(`#${encodeShareHash({ src: DEFAULT_SOURCE })}`);
  });

  it("applies a #c= share payload on mount (source and name)", () => {
    window.location.hash = `#${encodeShareHash({ name: "From a friend", src: "H 0\nH 1\nH 2" })}`;
    render(<PlaygroundBench />);
    expect(sourceBox()).toHaveValue("H 0\nH 1\nH 2");
    expect(screen.getByLabelText("Circuit name")).toHaveValue("From a friend");
    expect(screen.getByText("3 qubits — 3 gates")).toBeInTheDocument();
  });

  it("falls back to the default source when the hash payload is invalid", () => {
    window.location.hash = "#c=!!!not-base64url!!!";
    render(<PlaygroundBench />);
    expect(sourceBox()).toHaveValue(DEFAULT_SOURCE);
  });

  it("always shows the compiled OpenQASM export, byte-counted against the submit cap", () => {
    render(<PlaygroundBench />);
    const pre = document.querySelector("pre");
    expect(pre?.textContent).toContain("OPENQASM 3.0;");
    expect(pre?.textContent).toContain("qubit[2] q;");
    expect(pre?.textContent).toContain("h q[0];");
    expect(pre?.textContent).toContain("cnot q[0], q[1];");
    expect(pre?.textContent).toContain("c = measure q;");
    expect(
      screen.getByText(new RegExp(`submit cap ${QASM_SUBMIT_BYTE_CAP.toLocaleString()} bytes`)),
    ).toBeInTheDocument();
    // Unconfigured build: no dead button, just the honest export caption
    expect(
      screen.queryByRole("button", { name: "Send to real hardware" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/anywhere OpenQASM 3\.0 is accepted/)).toBeInTheDocument();
  });

  it("stages a handoff and routes to the workspace when QPU is configured", () => {
    (isQpuConfigured as jest.Mock).mockReturnValue(true);
    render(<PlaygroundBench />);
    // Honest, PRICING-derived rate line (never hand-typed dollars)
    const rate = costLabel("IQM");
    expect(screen.getByText((t) => t.includes(rate))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Circuit name"), { target: { value: "Bell to fly" } });
    const send = screen.getByRole("button", { name: "Send to real hardware" });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    const handoff = peekHandoff();
    expect(handoff?.qasm).toContain("OPENQASM 3.0;");
    expect(handoff?.qasm).toContain("cnot q[0], q[1];");
    expect(handoff?.name).toBe("Bell to fly");
    expect(pushMock).toHaveBeenCalledWith("/workspace#hardware");
  });

  it("disables the send button for a gate-less circuit", () => {
    (isQpuConfigured as jest.Mock).mockReturnValue(true);
    render(<PlaygroundBench />);
    fireEvent.change(sourceBox(), { target: { value: "# nothing yet" } });
    expect(screen.getByRole("button", { name: "Send to real hardware" })).toBeDisabled();
  });

  it("disables the send button when the compiled circuit exceeds the submit byte cap", () => {
    (isQpuConfigured as jest.Mock).mockReturnValue(true);
    render(<PlaygroundBench />);
    // 999 'X 0' lines = 3,996 source chars (inside the textarea's 4,000 cap) but
    // ~8KB compiled ('x q[0];' per line) — over the 7,000-byte Lambda cap. The
    // click would be a guaranteed reject, so the button must foreclose it.
    const overCap = Array.from({ length: 999 }, () => "X 0").join("\n");
    fireEvent.change(sourceBox(), { target: { value: overCap } });
    expect(screen.getByRole("button", { name: "Send to real hardware" })).toBeDisabled();
    const caption = screen.getByText(new RegExp(`submit cap ${QASM_SUBMIT_BYTE_CAP.toLocaleString("en-US")} bytes`));
    expect(caption.className).toContain("text-danger");
  });

  it("ends editing mode when a preset replaces the circuit (Save creates, not overwrites)", () => {
    render(<PlaygroundBench />);
    fireEvent.change(screen.getByLabelText("Circuit name"), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Save updates it/)).toBeInTheDocument();

    // A preset swap is a start-fresh gesture — editing mode must end with it.
    fireEvent.click(screen.getByRole("button", { name: "GHZ-3" }));
    expect(screen.queryByText(/Save updates it/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Circuit name"), { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // Both circuits exist — the preset save did NOT overwrite "Mine".
    expect(screen.getByRole("button", { name: "Load Mine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Fresh" })).toBeInTheDocument();
  });

  it("samples deterministically from the seed, resamples on demand", () => {
    render(<PlaygroundBench />);
    const program = parseProgram(DEFAULT_SOURCE);
    const probs = probabilities(simulate(opsFor(program, Math.PI / 2), program.n));
    const sampling = screen.getByRole("region", { name: "Sampling" });

    const first = sampleCounts(probs, 100, mulberry32(42));
    expect(
      within(sampling).getByRole("img", {
        name: `Basis 00: sampled ${formatPercent(first[0])}, exact ${formatPercent(probs[0] * 100)}`,
      }),
    ).toBeInTheDocument();

    fireEvent.click(within(sampling).getByRole("button", { name: "Resample" }));
    const second = sampleCounts(probs, 100, mulberry32((42 + NONCE_STRIDE) | 0));
    expect(
      within(sampling).getByRole("img", {
        name: `Basis 00: sampled ${formatPercent(second[0])}, exact ${formatPercent(probs[0] * 100)}`,
      }),
    ).toBeInTheDocument();
  });

  it("always samples the final state, not the scrubbed frame", () => {
    render(<PlaygroundBench />);
    fireEvent.change(screen.getByRole("slider", { name: "Step through the circuit" }), {
      target: { value: "0" },
    });
    const sampling = screen.getByRole("region", { name: "Sampling" });
    // Exact column still shows the Bell 50/50, not the ground state's 100/0
    expect(within(sampling).getAllByRole("img")[0]).toHaveAccessibleName(
      expect.stringContaining("exact 50.0%"),
    );
  });
});
