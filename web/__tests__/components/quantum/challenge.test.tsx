/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { Challenge } from "@/components/quantum/challenge";

const bell = JSON.stringify({
  id: "bell-widget-1",
  prompt: "Prepare the Bell state Φ+ on 2 qubits.",
  qubits: 2,
  target: { program: "H 0\nCNOT 0 1" },
  starter: "H 0",
  allowedGates: ["H", "X", "CNOT"],
  hint: "Entangle after a Hadamard.",
});

describe("Challenge", () => {
  beforeEach(() => localStorage.clear());

  it("renders the prompt", () => {
    render(<Challenge source={bell} />);
    expect(screen.getByText(/Prepare the Bell state/)).toBeInTheDocument();
  });

  it("shows an error for a malformed challenge", () => {
    render(<Challenge source="{ not json" />);
    expect(screen.getByText(/challenge error/i)).toBeInTheDocument();
  });

  it("seeds the editor with the starter code", () => {
    render(<Challenge source={bell} />);
    expect(screen.getByRole("textbox")).toHaveValue("H 0");
  });

  it("marks a correct solution solved and persists progress", () => {
    render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(screen.getByText(/correct/i)).toBeInTheDocument();
    expect(
      Object.keys(localStorage).some((k) => k.startsWith("qc:challenge:"))
    ).toBe(true);
  });

  it("surfaces the hint when the answer is wrong", () => {
    render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "H 0" } });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(screen.getByText(/entangle after a hadamard/i)).toBeInTheDocument();
  });

  // The grade -> CardState adapter: a solved challenge becomes a review card.
  const challengeCardKey = () =>
    Object.keys(localStorage).find((k) => k.startsWith("qc:card:challenge:"));

  it("a clean first solve creates a spaced-repetition card graded 'good'", () => {
    render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));

    const key = challengeCardKey();
    expect(key).toBeDefined();
    const card = JSON.parse(localStorage.getItem(key!)!);
    expect(card.reps).toBe(1);
    expect(card.difficulty).toBe(5); // "good" leaves difficulty unchanged
    expect(screen.getByText(/added to your review/i)).toBeInTheDocument();
  });

  it("a solve after a wrong attempt is graded 'hard'", () => {
    render(<Challenge source={bell} />);
    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "H 0" } }); // valid but wrong
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    fireEvent.change(textbox, { target: { value: "H 0\nCNOT 0 1" } });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));

    const card = JSON.parse(localStorage.getItem(challengeCardKey()!)!);
    expect(card.reps).toBe(1);
    expect(card.difficulty).toBeCloseTo(5.3); // "hard" nudges difficulty up by 0.3
  });

  it("re-solving in the same session does not advance the schedule", () => {
    render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    const check = screen.getByRole("button", { name: /check/i });
    fireEvent.click(check);
    fireEvent.click(check); // solve again immediately — the card is not due yet

    const card = JSON.parse(localStorage.getItem(challengeCardKey()!)!);
    expect(card.reps).toBe(1); // unchanged, not double-counted
  });

  it("a configuration error does not create a card", () => {
    render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Z 0" } }); // disallowed gate
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(challengeCardKey()).toBeUndefined();
  });

  it("suppresses the persistent solved-once-ever badge on the review surface", () => {
    const first = render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    first.unmount(); // qc:challenge:<id> = "1" is now persisted
    // A fresh LESSON mount shows the persistent badge...
    const lesson = render(<Challenge source={bell} />);
    expect(screen.getByText("Solved")).toBeInTheDocument();
    lesson.unmount();
    // ...but a fresh REVIEW mount must not claim the re-attempt is already done.
    render(<Challenge source={bell} surface="review" />);
    expect(screen.queryByText("Solved")).not.toBeInTheDocument();
  });

  it("caches its kind + raw fence source so /review can re-mount the live widget", () => {
    render(<Challenge source={bell} />);
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("qc:card-content:challenge:")
    );
    expect(key).toBeDefined();
    const content = JSON.parse(localStorage.getItem(key!)!);
    expect(content.kind).toBe("challenge");
    expect(content.source).toBe(bell);
  });

  it("captures the shortest solution and shows it, keeping the personal best", () => {
    const { unmount } = render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "H 0\nCNOT 0 1" } });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(screen.getByText(/solved in 2 gates — your best/i)).toBeInTheDocument();
    const key = Object.keys(localStorage).find((k) => k.startsWith("qc:measure:challenge:"));
    expect(JSON.parse(localStorage.getItem(key!)!)).toEqual({ gates: 2 });
    unmount();

    // A later, longer solve does not raise the recorded best and says so.
    render(<Challenge source={bell} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1\nX 1\nX 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(screen.getByText(/solved in 4 gates — your best is 2/i)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(key!)!)).toEqual({ gates: 2 }); // unchanged
  });

  // persist={false} is the /e2e-fixtures contract: grading works end to end,
  // but NOTHING touches localStorage — no card content on mount, no FSRS card
  // or solved flag on solve. Without it, anyone visiting or solving a fixture
  // would mint phantom qc:* keys that the additive cross-device sync then
  // replicates to every device forever (there is no card deletion).
  it("persist={false}: grades normally but writes zero qc:* keys on mount or solve", () => {
    render(<Challenge source={bell} persist={false} />);
    expect(Object.keys(localStorage)).toHaveLength(0); // no card-content on mount
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "H 0\nCNOT 0 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check/i }));
    expect(screen.getByText(/correct/i)).toBeInTheDocument(); // grading still works
    expect(Object.keys(localStorage)).toHaveLength(0); // no card, flag, or content
    expect(screen.queryByText(/added to your review/i)).not.toBeInTheDocument();
  });
});
