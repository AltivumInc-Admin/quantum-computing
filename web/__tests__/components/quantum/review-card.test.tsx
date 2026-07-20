/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewCard } from "@/components/quantum/review-card";

const CARD = JSON.stringify({
  id: "test-card-1",
  prompt: "What gate creates an equal superposition from |0>?",
  answer: "The Hadamard gate, `H`.",
});

describe("ReviewCard", () => {
  beforeEach(() => localStorage.clear());

  it("shows the prompt and hides the answer until revealed", () => {
    render(<ReviewCard source={CARD} />);
    expect(screen.getByText(/equal superposition/i)).toBeInTheDocument();
    expect(screen.queryByText(/Hadamard gate/i)).not.toBeInTheDocument();
  });

  it("reveals the answer and the four grade buttons on demand", () => {
    render(<ReviewCard source={CARD} />);
    fireEvent.click(screen.getByText("Show answer"));
    expect(screen.getByText(/Hadamard gate/i)).toBeInTheDocument();
    for (const label of ["Again", "Hard", "Good", "Easy"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("schedules the card and reports the next review after grading", () => {
    render(<ReviewCard source={CARD} />);
    fireEvent.click(screen.getByText("Show answer"));
    fireEvent.click(screen.getByText("Good"));
    expect(screen.getByText(/next review/i)).toBeInTheDocument();
    // Persisted under the documented key.
    expect(localStorage.getItem("qc:card:test-card-1")).not.toBeNull();
  });

  it("re-grading a card that is no longer due is a no-op (interval-inflation guard)", () => {
    render(<ReviewCard source={CARD} />);
    fireEvent.click(screen.getByText("Show answer"));
    fireEvent.click(screen.getByText("Good"));
    const first = JSON.parse(localStorage.getItem("qc:card:test-card-1")!);
    expect(first.reps).toBe(1);

    // The card can still be revealed for practice, but a second rating in the
    // same due window must not advance the schedule.
    fireEvent.click(screen.getByText("Show answer"));
    fireEvent.click(screen.getByText("Good"));
    const second = JSON.parse(localStorage.getItem("qc:card:test-card-1")!);
    expect(second.reps).toBe(1);
    expect(second.dueEpochDay).toBe(first.dueEpochDay);
    expect(screen.getByText(/schedule unchanged/i)).toBeInTheDocument();
  });

  it("caches its prompt + answer so /review can re-mount the card from the schedule alone", () => {
    render(<ReviewCard source={CARD} />);
    // The sole qc:card-content writer for the 28 authored qcards: without it
    // getCardContent returns null and every authored card silently drops off
    // the /review roster. The six graded Reps each have this same test.
    const cached = JSON.parse(localStorage.getItem("qc:card-content:test-card-1")!);
    expect(cached).toEqual({
      prompt: "What gate creates an equal superposition from |0>?",
      answer: "The Hadamard gate, `H`.",
    });
    // No kind/source — that shape is what makes the dashboard pick the recall
    // card over a live widget.
    expect(cached.kind).toBeUndefined();
    expect(cached.source).toBeUndefined();
  });

  it("reports the success STREAK, not a lifetime count, and hides it after a lapse", () => {
    const today = Math.floor(Date.now() / 86_400_000);
    // A card with real history whose last grade was "Again": reps is 0 by
    // construction (schedule() zeroes it on every lapse), so a lifetime-count
    // label would read "reviewed 0x" on a card reviewed six times.
    localStorage.setItem(
      "qc:card:test-card-1",
      JSON.stringify({
        reps: 0, lapses: 3, stability: 1, difficulty: 6,
        dueEpochDay: today, lastEpochDay: today - 1,
      })
    );
    const { unmount } = render(<ReviewCard source={CARD} />);
    expect(screen.queryByText(/in a row/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reviewed/i)).not.toBeInTheDocument();
    unmount();

    localStorage.setItem(
      "qc:card:test-card-1",
      JSON.stringify({
        reps: 4, lapses: 1, stability: 12, difficulty: 5,
        dueEpochDay: today, lastEpochDay: today - 12,
      })
    );
    render(<ReviewCard source={CARD} />);
    expect(screen.getByText("4 in a row")).toBeInTheDocument();
  });

  it("discards a corrupt-but-valid-JSON record instead of printing undefined", () => {
    // The exact class isValidCardState was written to reject. The dashboard and
    // the nav badge already treat this record as absent; this card must agree.
    localStorage.setItem("qc:card:test-card-1", "{}");
    render(<ReviewCard source={CARD} />);
    expect(screen.queryByText(/in a row/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("renders an error card for malformed JSON", () => {
    render(<ReviewCard source={"{ not json"} />);
    expect(screen.getByText(/card error:/i)).toBeInTheDocument();
  });

  it("requires a non-empty id", () => {
    render(<ReviewCard source={JSON.stringify({ id: "", prompt: "p", answer: "a" })} />);
    expect(screen.getByText(/non-empty string "id"/i)).toBeInTheDocument();
  });
});
