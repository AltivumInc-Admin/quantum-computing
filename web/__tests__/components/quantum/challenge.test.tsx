/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { Challenge } from "@/components/quantum/challenge";

const bell = JSON.stringify({
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
});
