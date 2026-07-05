/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebugCircuitWidget } from "@/components/quantum/debug-circuit-widget";

const bell = JSON.stringify({
  id: "t-debug-bell",
  prompt: "The Bell prep below never entangles the qubits. Fix it.",
  qubits: 2,
  broken: { program: "H 0\nCNOT 1 0" },
  target: { program: "H 0\nCNOT 0 1" },
  allowedGates: ["H", "X", "CNOT"],
  hint: "Which end of the CNOT is the control?",
});

describe("DebugCircuitWidget", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear(); // the reload-proof miss counter lives here
  });

  it("seeds the editor with the BROKEN circuit — the load-bearing difference", () => {
    render(<DebugCircuitWidget source={bell} />);
    expect(screen.getByRole("textbox")).toHaveValue("H 0\nCNOT 1 0");
  });

  it("shows an error for a malformed spec", () => {
    render(<DebugCircuitWidget source="{ nope" />);
    expect(screen.getByText(/debug error/i)).toBeInTheDocument();
  });

  it("surfaces an AUTHORING error when the broken circuit already solves the Rep", () => {
    const degenerate = JSON.stringify({
      id: "t-degenerate",
      prompt: "x",
      broken: { program: "H 0" },
      target: { program: "H 0" },
    });
    render(<DebugCircuitWidget source={degenerate} />);
    expect(screen.getByText(/nothing to fix/i)).toBeInTheDocument();
  });

  it("checking the untouched circuit says the bug hasn't changed — and does NOT create a card", () => {
    render(<DebugCircuitWidget source={bell} />);
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(screen.getByText(/haven't changed the bug/i)).toBeInTheDocument();
    expect(
      Object.keys(localStorage).some((k) => k.startsWith("qc:card:debug:"))
    ).toBe(false);
  });

  it("a correct fix solves, persists the flag, and creates a debug-namespaced card", () => {
    render(<DebugCircuitWidget source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(screen.getByText(/correct — your fix/i)).toBeInTheDocument();
    expect(localStorage.getItem("qc:debug:t-debug-bell")).toBe("1");
    const card = JSON.parse(localStorage.getItem("qc:card:debug:t-debug-bell")!);
    expect(card.reps).toBe(1);
    expect(card.difficulty).toBe(5); // clean first fix rates "good"
    expect(screen.getByText(/added to your review/i)).toBeInTheDocument();
  });

  it("checking the UNTOUCHED seed then fixing cleanly still rates 'good' — reproducing the symptom is not a miss", () => {
    render(<DebugCircuitWidget source={bell} />);
    fireEvent.click(screen.getByRole("button", { name: /^check$/i })); // untouched seed
    expect(screen.getByText(/haven't changed the bug/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
    const card = JSON.parse(localStorage.getItem("qc:card:debug:t-debug-bell")!);
    expect(card.difficulty).toBe(5); // "good", NOT the 5.3 a counted miss would give
  });

  it("the miss counter survives a remount (reload-laundering the 'hard' rating is closed)", () => {
    const first = render(<DebugCircuitWidget source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "H 0\nX 1" } }); // genuine miss
    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
    first.unmount(); // "reload"
    render(<DebugCircuitWidget source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
    const card = JSON.parse(localStorage.getItem("qc:card:debug:t-debug-bell")!);
    expect(card.difficulty).toBeCloseTo(5.3); // the pre-reload miss still counts
  });

  it("editing the code clears a stale verdict — 'haven't changed the bug' must not describe old code", () => {
    render(<DebugCircuitWidget source={bell} />);
    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
    expect(screen.getByText(/haven't changed the bug/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    expect(screen.queryByText(/haven't changed the bug/i)).not.toBeInTheDocument();
  });

  it("a fix after a genuine miss rates 'hard'", () => {
    render(<DebugCircuitWidget source={bell} />);
    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "H 0\nX 1" } }); // changed, still wrong
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    fireEvent.change(textbox, { target: { value: "H 0\nCNOT 0 1" } });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    const card = JSON.parse(localStorage.getItem("qc:card:debug:t-debug-bell")!);
    expect(card.difficulty).toBeCloseTo(5.3); // "hard" nudges difficulty up
  });

  it("re-solving in the same session does not advance the schedule", () => {
    render(<DebugCircuitWidget source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    const check = screen.getByRole("button", { name: /check/i });
    fireEvent.click(check);
    fireEvent.click(check);
    const card = JSON.parse(localStorage.getItem("qc:card:debug:t-debug-bell")!);
    expect(card.reps).toBe(1);
  });

  it("reset restores the broken circuit, clears the verdict, and announces the restore", () => {
    render(<DebugCircuitWidget source={bell} />);
    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "FLIP 0" } });
    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
    expect(screen.getByText(/your circuit:/i)).toBeInTheDocument(); // parse error verdict
    fireEvent.click(screen.getByRole("button", { name: /reset to the broken circuit/i }));
    expect(textbox).toHaveValue("H 0\nCNOT 1 0");
    expect(screen.queryByText(/your circuit:/i)).not.toBeInTheDocument();
    // The restore swaps INTO the persistent status region so SRs announce it
    // (unmounting a role=status region is never announced).
    expect(screen.getByText(/editor restored to the original broken circuit/i)).toBeInTheDocument();
  });

  it("on /review, Reset after a solve cannot un-complete the Fixed badge under the Reviewed note", () => {
    render(<DebugCircuitWidget source={bell} surface="review" />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
    expect(screen.getByText("Fixed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reset to the broken circuit/i }));
    // The session solve is sticky: badge stays consistent with the schedule note.
    expect(screen.getByText("Fixed")).toBeInTheDocument();
  });

  it("caches kind 'debug' + raw fence source so /review can re-mount the live widget", () => {
    render(<DebugCircuitWidget source={bell} />);
    const content = JSON.parse(
      localStorage.getItem("qc:card-content:debug:t-debug-bell")!
    );
    expect(content.kind).toBe("debug");
    expect(content.source).toBe(bell);
    expect(content.answer).toMatch(/H 0; CNOT 0 1/);
  });

  it("suppresses the persistent Fixed badge on the review surface", () => {
    const first = render(<DebugCircuitWidget source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    first.unmount();
    const lesson = render(<DebugCircuitWidget source={bell} />);
    expect(screen.getByText("Fixed")).toBeInTheDocument();
    lesson.unmount();
    render(<DebugCircuitWidget source={bell} surface="review" />);
    expect(screen.queryByText("Fixed")).not.toBeInTheDocument();
  });
});
